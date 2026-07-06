import * as NodeStdio from "@effect/platform-node/NodeStdio";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Schema from "effect/Schema";
import { McpSchema, McpServer, Tool as AiTool } from "effect/unstable/ai";

import packageJson from "../package.json" with { type: "json" };

import { errorMessage } from "./errors.ts";
import { VideoQueryService } from "./video-query.ts";

export const askVideoToolName = "ask_video";

const AskVideoToolInput = Schema.Struct({
  videoPath: Schema.String.check(Schema.isNonEmpty()).pipe(
    Schema.annotate({
      description: "Local path, file:// URL, remote video URL, or YouTube URL.",
    }),
  ),
  query: Schema.String.check(Schema.isNonEmpty()).pipe(
    Schema.annotate({
      description: "Question or instruction to answer from the video.",
    }),
  ),
});

const askVideoInputJsonSchema = AiTool.getJsonSchemaFromSchema(AskVideoToolInput);
const decodeAskVideoToolInput = Schema.decodeUnknownEffect(AskVideoToolInput);

const textToolResult = (text: string, isError = false) =>
  new McpSchema.CallToolResult({
    content: [McpSchema.TextContent.make({ text })],
    ...(isError ? { isError: true } : {}),
  });

export const registerAskVideoTool = Effect.gen(function* () {
  const server = yield* McpServer.McpServer;
  const service = yield* VideoQueryService;

  yield* server.addTool({
    tool: new McpSchema.Tool({
      name: askVideoToolName,
      title: "Ask Video",
      description: "Answer a query about a video using askvid's configured video model backend.",
      inputSchema: askVideoInputJsonSchema,
      annotations: McpSchema.ToolAnnotations.make({
        title: "Ask Video",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      }),
    }),
    annotations: Context.empty(),
    handle: (payload) =>
      Effect.gen(function* () {
        const input = yield* decodeAskVideoToolInput(payload);
        const result = yield* service.ask({
          videoSource: input.videoPath,
          question: input.query,
          cwd: process.cwd(),
          debug: false,
        });

        return textToolResult(result.answer);
      }).pipe(Effect.catch((error) => Effect.succeed(textToolResult(errorMessage(error), true)))),
  });
});

export const askvidMcpServerLayer = Layer.effectDiscard(registerAskVideoTool).pipe(
  Layer.provide(
    McpServer.layerStdio({
      name: "askvid",
      version: packageJson.version,
    }),
  ),
  Layer.provide(NodeStdio.layer),
  Layer.provide(Layer.succeed(Logger.LogToStderr)(true)),
);

export const runMcpServer = Layer.launch(askvidMcpServerLayer);
