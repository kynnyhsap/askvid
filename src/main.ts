#!/usr/bin/env node
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Runtime from "effect/Runtime";
import { CliError } from "effect/unstable/cli";

import { VideoBackendTest } from "./backend.ts";
import { runAskvid } from "./cli.ts";
import { loadAppConfig } from "./config.ts";
import { errorMessage } from "./errors.ts";
import { OpenRouterBackendLive } from "./openrouter.ts";
import { VideoSourceResolverLive } from "./source.ts";
import { VideoQueryServiceLive } from "./video-query.ts";

const configuredBackendLayer = Layer.unwrap(
  loadAppConfig.pipe(
    Effect.map((config) => (config.backend === "test" ? VideoBackendTest : OpenRouterBackendLive)),
  ),
);

const platformLayer = Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerFetch);
const queryDependenciesLayer = Layer.mergeAll(VideoSourceResolverLive, configuredBackendLayer).pipe(
  Layer.provide(platformLayer),
);
const queryLayer = VideoQueryServiceLive.pipe(Layer.provide(queryDependenciesLayer));
const layer = Layer.mergeAll(platformLayer, queryDependenciesLayer, queryLayer);

const program = runAskvid.pipe(
  Effect.catchIf(
    () => true,
    (error) => {
      if (CliError.isCliError(error) && error._tag === "ShowHelp") {
        return Effect.void;
      }
      return Console.error(`ERROR\n  ${errorMessage(error)}`).pipe(
        Effect.andThen(() => Effect.fail(error)),
      );
    },
  ),
  Effect.provide(layer),
);

NodeRuntime.runMain(program, {
  disableErrorReporting: true,
  teardown: (exit, onExit) =>
    Runtime.defaultTeardown(exit, (code) => {
      process.exitCode = code;
      onExit(code);
    }),
});
