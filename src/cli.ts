import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { loadAppConfig } from "./config.ts";
import { DryRunReport } from "./domain.ts";
import { VideoSourceResolver } from "./source.ts";
import { VideoQueryService } from "./video-query.ts";

const videoSourceArgument = Argument.string("video-source").pipe(
  Argument.withDescription("Local path, file:// URL, remote video URL, or YouTube URL."),
  Argument.withMetavar("VIDEO"),
);

const questionArgument = Argument.string("question").pipe(
  Argument.withDescription("Question or instruction to answer from the video."),
  Argument.withMetavar("QUESTION"),
);

const dryRunFlag = Flag.boolean("dry-run").pipe(
  Flag.withDescription("Print the planned source and backend without contacting the model."),
  Flag.withDefault(false),
);

const debugFlag = Flag.boolean("debug").pipe(
  Flag.withDescription("Print verbose diagnostic logs to stderr."),
  Flag.withDefault(false),
);

export const askvidCommand = Command.make(
  "askvid",
  {
    videoSource: videoSourceArgument,
    question: questionArgument,
    dryRun: dryRunFlag,
    debug: debugFlag,
  },
  (input) =>
    Effect.gen(function* () {
      const config = yield* loadAppConfig;
      const debug = input.debug || config.debug;

      if (input.dryRun) {
        if (debug) {
          yield* Console.error(`[debug] dry-run enabled; model backend will not be called`);
        }
        const sourceResolver = yield* VideoSourceResolver;
        const source = yield* sourceResolver.inspect(input.videoSource, process.cwd());
        const report = DryRunReport.make({
          dryRun: true,
          backend: config.backend,
          model: config.model,
          maxTokens: config.maxTokens,
          source,
          question: input.question,
          responseCache: config.responseCache,
        });
        yield* Console.log(JSON.stringify(report, null, 2));
        return;
      }

      const service = yield* VideoQueryService;
      if (debug) {
        yield* Console.error(`[debug] asking ${input.videoSource}`);
      }
      const result = yield* service.ask({
        videoSource: input.videoSource,
        question: input.question,
        cwd: process.cwd(),
        debug,
      });

      if (debug) {
        yield* Console.error(
          `[debug] model=${result.model} source=${result.sourceKind} status=${result.status} latencyMs=${result.latencyMs}`,
        );
        if (result.metadata.status) {
          yield* Console.error(
            `[debug] cache=${result.metadata.status} ttl=${result.metadata.ttl ?? "unknown"} age=${result.metadata.age ?? "0"}`,
          );
        }
      }

      yield* Console.log(result.answer);
    }),
).pipe(
  Command.withDescription(
    "Ask questions about a local, remote, or YouTube video using a video model backend.",
  ),
);

export const runAskvid = Command.run(askvidCommand, { version: "0.1.0" });
