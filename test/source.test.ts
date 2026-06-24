import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { describe, expect, it } from "vitest";

import {
  isYouTubeUrl,
  makeVideoSourceResolver,
  mimeFromVideoPath,
  normalizeLocalPath,
  sanitizeVideoInput,
  videoMimeFromPathOrContentType,
} from "../src/source.ts";

describe("video source helpers", () => {
  it("detects YouTube URLs", () => {
    expect(isYouTubeUrl("https://youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isYouTubeUrl("https://example.com/video.mp4")).toBe(false);
  });

  it("normalizes shell-escaped and URL-encoded local paths", () => {
    expect(normalizeLocalPath("A\\ B/video%20one.mp4")).toBe("A B/video one.mp4");
  });

  it("sanitizes @-prefixed inputs", () => {
    expect(sanitizeVideoInput(" @./video.mp4 ")).toBe("./video.mp4");
  });

  it("maps supported video MIME types from extensions", () => {
    expect(mimeFromVideoPath("clip.mp4")).toBe("video/mp4");
    expect(mimeFromVideoPath("clip.webm?x=1")).toBe("video/webm");
    expect(mimeFromVideoPath("clip.mov")).toBe("video/mov");
    expect(mimeFromVideoPath("clip.mpeg")).toBe("video/mpeg");
  });

  it("prefers video content-type headers", () => {
    expect(videoMimeFromPathOrContentType("clip.mp4", "video/webm; charset=utf-8")).toBe(
      "video/webm",
    );
    expect(videoMimeFromPathOrContentType("clip.webm", "application/octet-stream")).toBe(
      "video/webm",
    );
  });

  it("resolves remote videos by downloading and inlining bytes", async () => {
    const resolver = makeVideoSourceResolver(
      {} as FileSystem.FileSystem,
      {
        get: (url: string) =>
          Effect.succeed({
            status: 200,
            headers: { "content-type": "video/webm" },
            arrayBuffer: Effect.succeed(Buffer.from(`bytes from ${url}`).buffer),
          }),
      } as unknown as HttpClient.HttpClient,
    );

    const source = await Effect.runPromise(
      resolver.resolve("https://cdn.example.test/tiny.mp4", { cwd: process.cwd() }),
    );

    expect(source.kind).toBe("remote");
    expect(source.mimeType).toBe("video/webm");
    expect(source.bytes).toBeGreaterThan(0);
    expect(source.videoUrl).toMatch(/^data:video\/webm;base64,/);
  });
});
