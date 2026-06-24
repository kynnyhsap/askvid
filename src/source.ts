import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { MAX_INLINE_BYTES } from "./config.ts";
import { ResolvedVideoSource, type InspectedVideoSource } from "./domain.ts";
import { FileTooLargeError, SourceError } from "./errors.ts";

export class VideoSourceResolver extends Context.Service<
  VideoSourceResolver,
  {
    readonly resolve: (
      rawInput: string,
      options: { readonly cwd: string; readonly maxInlineBytes?: number },
    ) => Effect.Effect<ResolvedVideoSource, SourceError | FileTooLargeError>;
    readonly inspect: (
      rawInput: string,
      cwd: string,
    ) => Effect.Effect<InspectedVideoSource, SourceError>;
  }
>()("askvid/VideoSourceResolver") {}

export const makeVideoSourceResolver = (
  fs: FileSystem.FileSystem,
  client: HttpClient.HttpClient,
): VideoSourceResolver["Service"] => ({
  resolve: (rawInput, options) =>
    Effect.gen(function* () {
      const input = sanitizeVideoInput(rawInput);
      const maxInlineBytes = options.maxInlineBytes ?? MAX_INLINE_BYTES;

      if (isYouTubeUrl(input)) {
        return ResolvedVideoSource.make({ kind: "youtube", input, videoUrl: input });
      }

      if (isHttpUrl(input)) {
        const response = yield* client.get(input).pipe(
          Effect.mapError(
            (cause) =>
              new SourceError({
                message: `Failed to fetch remote video ${input}: ${String(cause)}`,
              }),
          ),
        );

        if (response.status < 200 || response.status >= 300) {
          return yield* new SourceError({
            message: `Failed to fetch remote video ${input}: HTTP ${response.status}`,
          });
        }

        const mimeType = videoMimeFromPathOrContentType(
          input,
          response.headers["content-type"] ?? null,
        );
        const bytes = Buffer.from(
          yield* response.arrayBuffer.pipe(
            Effect.mapError(
              (cause) =>
                new SourceError({
                  message: `Failed to read remote video ${input}: ${String(cause)}`,
                }),
            ),
          ),
        );

        yield* validateInlineSize(bytes.byteLength, maxInlineBytes);

        return ResolvedVideoSource.make({
          kind: "remote",
          input,
          videoUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
          bytes: bytes.byteLength,
          mimeType,
        });
      }

      const path = toAbsoluteLocalPath(input, options.cwd);
      const bytes = Buffer.from(
        yield* fs.readFile(path).pipe(
          Effect.mapError(
            (cause) =>
              new SourceError({
                message: `Failed to read local video ${path}: ${String(cause)}`,
              }),
          ),
        ),
      );
      yield* validateInlineSize(bytes.byteLength, maxInlineBytes);

      const mimeType = mimeFromVideoPath(path);
      return ResolvedVideoSource.make({
        kind: "local",
        input,
        path,
        videoUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
        bytes: bytes.byteLength,
        mimeType,
      });
    }),

  inspect: (rawInput, cwd) =>
    Effect.gen(function* () {
      const input = sanitizeVideoInput(rawInput);

      if (isYouTubeUrl(input)) {
        return {
          kind: "youtube" as const,
          input,
          videoUrlPreview: input,
          willDownload: false,
          willReadFile: false,
        };
      }

      if (isHttpUrl(input)) {
        const mimeType = mimeFromVideoPath(input);
        return {
          kind: "remote" as const,
          input,
          videoUrlPreview: `data:${mimeType};base64,<downloaded-remote-video>`,
          mimeType,
          willDownload: true,
          willReadFile: false,
        };
      }

      const path = toAbsoluteLocalPath(input, cwd);
      const file = yield* fs.stat(path).pipe(
        Effect.mapError(
          (cause) =>
            new SourceError({
              message: `Failed to stat local video ${path}: ${String(cause)}`,
            }),
        ),
      );
      const mimeType = mimeFromVideoPath(path);

      return {
        kind: "local" as const,
        input,
        path,
        bytes: Number(file.size),
        mimeType,
        videoUrlPreview: `data:${mimeType};base64,<local-video-bytes>`,
        willDownload: false,
        willReadFile: true,
      };
    }),
});

export const VideoSourceResolverLive = Layer.effect(
  VideoSourceResolver,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const client = yield* HttpClient.HttpClient;
    return makeVideoSourceResolver(fs, client);
  }),
);

export const VideoSourceResolverTest = Layer.succeed(VideoSourceResolver, {
  resolve: (rawInput: string) => Effect.succeed(makeTestResolvedVideoSource(rawInput)),
  inspect: (rawInput: string) => Effect.succeed(makeTestInspectedVideoSource(rawInput)),
});

export const sanitizeVideoInput = (rawInput: string): string => rawInput.trim().replace(/^@/, "");

export const isHttpUrl = (value: string): boolean =>
  value.startsWith("http://") || value.startsWith("https://");

export const isYouTubeUrl = (value: string): boolean => {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com";
  } catch {
    return false;
  }
};

export const toAbsoluteLocalPath = (input: string, cwd: string): string => {
  const path = normalizeLocalPath(input.startsWith("file://") ? fileURLToPath(input) : input);
  return isAbsolute(path) ? path : resolve(cwd, path);
};

export const normalizeLocalPath = (path: string): string => {
  const unescaped = path.replace(/\\ /g, " ");
  try {
    return decodeURIComponent(unescaped);
  } catch {
    return unescaped;
  }
};

export const videoMimeFromPathOrContentType = (
  pathOrUrl: string,
  contentType: string | null,
): string => {
  const cleanContentType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (cleanContentType?.startsWith("video/")) return cleanContentType;
  return mimeFromVideoPath(pathOrUrl);
};

export const mimeFromVideoPath = (pathOrUrl: string): string => {
  const lower = pathOrUrl.toLowerCase().split(/[?#]/)[0] ?? pathOrUrl.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/mov";
  if (lower.endsWith(".mpeg") || lower.endsWith(".mpg")) return "video/mpeg";
  return "video/mp4";
};

export const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  return `${(mib / 1024).toFixed(1)} GiB`;
};

const validateInlineSize = (
  bytes: number,
  maxBytes: number,
): Effect.Effect<void, FileTooLargeError> =>
  bytes > maxBytes
    ? Effect.fail(
        new FileTooLargeError({
          bytes,
          maxBytes,
          message:
            `Video is ${formatSize(bytes)}, which is too large for inline model upload. ` +
            `Use a YouTube URL or a smaller video.`,
        }),
      )
    : Effect.void;

const makeTestResolvedVideoSource = (rawInput: string) => {
  const input = sanitizeVideoInput(rawInput);
  if (isYouTubeUrl(input)) {
    return ResolvedVideoSource.make({ kind: "youtube", input, videoUrl: input });
  }
  return ResolvedVideoSource.make({
    kind: "local",
    input,
    videoUrl: "data:video/mp4;base64,<test-video-bytes>",
    bytes: 16,
    mimeType: "video/mp4",
  });
};

const makeTestInspectedVideoSource = (rawInput: string): InspectedVideoSource => {
  const input = sanitizeVideoInput(rawInput);
  if (isYouTubeUrl(input)) {
    return {
      kind: "youtube",
      input,
      videoUrlPreview: input,
      willDownload: false,
      willReadFile: false,
    };
  }
  return {
    kind: "local",
    input,
    videoUrlPreview: "data:video/mp4;base64,<test-video-bytes>",
    bytes: 16,
    mimeType: "video/mp4",
    willDownload: false,
    willReadFile: true,
  };
};
