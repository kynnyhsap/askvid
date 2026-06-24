import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { VideoBackend } from "./backend.ts";
import { MAX_INLINE_BYTES } from "./config.ts";
import { VideoAnswer, type AskVideoInput } from "./domain.ts";
import type { AskvidError } from "./errors.ts";
import { VideoSourceResolver } from "./source.ts";

export class VideoQueryService extends Context.Service<
  VideoQueryService,
  {
    readonly ask: (input: AskVideoInput) => Effect.Effect<VideoAnswer, AskvidError>;
  }
>()("askvid/VideoQueryService") {}

export const VideoQueryServiceLive = Layer.effect(
  VideoQueryService,
  Effect.gen(function* () {
    const sourceResolver = yield* VideoSourceResolver;
    const backend = yield* VideoBackend;

    return {
      ask: (input: AskVideoInput) =>
        Effect.gen(function* () {
          const started = yield* Clock.currentTimeMillis;
          const video = yield* sourceResolver.resolve(input.videoSource, {
            cwd: input.cwd,
            maxInlineBytes: MAX_INLINE_BYTES,
          });
          const response = yield* backend.askVideo({ video, question: input.question });
          const finished = yield* Clock.currentTimeMillis;

          return VideoAnswer.make({
            answer: response.answer,
            model: response.model,
            sourceKind: video.kind,
            latencyMs: finished - started,
            ...(video.bytes === undefined ? {} : { bytes: video.bytes }),
            ...(response.status === undefined ? {} : { status: response.status }),
            metadata: response.metadata,
          });
        }),
    };
  }),
);
