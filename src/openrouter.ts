import * as OpenRouterClient from "@effect/ai-openrouter/OpenRouterClient";
import type * as Generated from "@effect/ai-openrouter/Generated";
import * as Effect from "effect/Effect";
import { identity } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { VideoBackend } from "./backend.ts";
import { loadRuntimeConfig } from "./config.ts";
import type { ResponseCacheConfig } from "./domain.ts";
import { BackendError, NoAnswerError } from "./errors.ts";

export const OpenRouterBackendLive = Layer.effect(
  VideoBackend,
  Effect.gen(function* () {
    const httpClient = yield* Effect.service<HttpClient.HttpClient, HttpClient.HttpClient>(
      HttpClient.HttpClient,
    );

    return {
      askVideo: ({ video, question }) =>
        Effect.gen(function* () {
          const config = yield* loadRuntimeConfig.pipe(
            Effect.mapError(
              (cause) =>
                new BackendError({
                  message: cause.message,
                }),
            ),
          );
          const client = yield* OpenRouterClient.make({
            apiKey: config.apiKey,
            siteReferrer: "https://local.askvid.cli",
            siteTitle: "askvid cli",
            transformClient: withOpenRouterCacheHeaders(config.responseCache),
          }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient));

          const request = buildOpenRouterRequest({
            model: config.model,
            maxTokens: config.maxTokens,
            question,
            videoUrl: video.videoUrl,
          });

          const [body, response] = yield* client.createChatCompletion(request).pipe(
            Effect.mapError(
              (cause) =>
                new BackendError({
                  message: `OpenRouter request failed: ${String(cause)}`,
                }),
            ),
          );

          const answer = yield* extractAnswer(body);
          return {
            answer,
            model: config.model,
            status: response.status,
            metadata: {
              ...(response.headers["x-openrouter-cache-status"] === undefined
                ? {}
                : { status: response.headers["x-openrouter-cache-status"] }),
              ...(response.headers["x-openrouter-cache-age"] === undefined
                ? {}
                : { age: response.headers["x-openrouter-cache-age"] }),
              ...(response.headers["x-openrouter-cache-ttl"] === undefined
                ? {}
                : { ttl: response.headers["x-openrouter-cache-ttl"] }),
              ...(response.headers["x-generation-id"] === undefined
                ? {}
                : { generationId: response.headers["x-generation-id"] }),
            },
          };
        }),
    };
  }),
);

export const buildVideoPrompt = (question: string): string =>
  "Answer the user's query by analyzing the video. Use visual content, speech/audio, timestamps, " +
  "and visible text when relevant. Be precise. If uncertain, say what is uncertain.\n\n" +
  `User query:\n${question}`;

export const buildOpenRouterRequest = (options: {
  readonly model: string;
  readonly maxTokens: number;
  readonly question: string;
  readonly videoUrl: string;
}): Generated.ChatGenerationParams => ({
  model: options.model,
  temperature: 0,
  max_tokens: options.maxTokens,
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: buildVideoPrompt(options.question) },
        { type: "video_url", video_url: { url: options.videoUrl } },
      ],
    },
  ],
});

const TextContentPart = Schema.Struct({ text: Schema.optionalKey(Schema.String) });
const MessageContent = Schema.Union([
  Schema.String,
  Schema.Null,
  Schema.Array(Schema.Union([Schema.String, TextContentPart])),
]);
const ChatCompletionResponse = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      message: Schema.Struct({
        content: Schema.optionalKey(MessageContent),
      }),
    }),
  ),
});

export const extractAnswer = (body: unknown): Effect.Effect<string, BackendError | NoAnswerError> =>
  Effect.gen(function* () {
    const decoded = yield* (
      Schema.decodeUnknownEffect(ChatCompletionResponse)(body) as Effect.Effect<
        typeof ChatCompletionResponse.Type,
        Schema.SchemaError
      >
    ).pipe(
      Effect.mapError(
        (cause) =>
          new BackendError({
            message: `OpenRouter response did not match expected schema: ${cause.message}`,
          }),
      ),
    );
    const content = decoded.choices[0]?.message.content;
    const answer = contentToText(content);
    if (!answer) {
      return yield* new NoAnswerError({ message: "OpenRouter returned no answer." });
    }
    return answer;
  });

export const withOpenRouterCacheHeaders =
  (cache: ResponseCacheConfig) =>
  (client: HttpClient.HttpClient): HttpClient.HttpClient =>
    client.pipe(
      HttpClient.mapRequest((request) =>
        request.pipe(
          cache.enabled ? HttpClientRequest.setHeader("X-OpenRouter-Cache", "true") : identity,
          cache.enabled && cache.ttlSeconds !== undefined
            ? HttpClientRequest.setHeader("X-OpenRouter-Cache-TTL", String(cache.ttlSeconds))
            : identity,
          cache.enabled && cache.clear
            ? HttpClientRequest.setHeader("X-OpenRouter-Cache-Clear", "true")
            : identity,
        ),
      ),
    );

const contentToText = (content: typeof MessageContent.Type | undefined): string | undefined => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((part) => (typeof part === "string" ? part : (part.text ?? "")))
    .join("");
  return text.length > 0 ? text : undefined;
};
