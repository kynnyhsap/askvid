import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { BackendVideoAnswer, BackendVideoRequest } from "./domain.ts";
import type { AskvidError } from "./errors.ts";

export class VideoBackend extends Context.Service<
  VideoBackend,
  {
    readonly askVideo: (
      request: BackendVideoRequest,
    ) => Effect.Effect<BackendVideoAnswer, AskvidError>;
  }
>()("askvid/VideoBackend") {}

export const VideoBackendTest = Layer.succeed(VideoBackend, {
  askVideo: ({ question }) =>
    Effect.succeed({
      answer: `test answer for: ${question}`,
      model: "test/video-model",
      status: 200,
      metadata: {},
    }),
});
