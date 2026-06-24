import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_TOKENS, DEFAULT_MODEL } from "../src/config.ts";
import { buildOpenRouterRequest, buildVideoPrompt, extractAnswer } from "../src/openrouter.ts";

describe("OpenRouter request builder", () => {
  it("builds the prompt with the user question", () => {
    expect(buildVideoPrompt("how many apples?")).toContain("User query:\nhow many apples?");
  });

  it("builds a chat-completions request with a video_url part", () => {
    const request = buildOpenRouterRequest({
      model: DEFAULT_MODEL,
      maxTokens: DEFAULT_MAX_TOKENS,
      question: "summarize this",
      videoUrl: "https://youtube.com/watch?v=abc",
    });

    expect(request).toMatchObject({
      model: DEFAULT_MODEL,
      temperature: 0,
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: [
            { type: "text" },
            { type: "video_url", video_url: { url: "https://youtube.com/watch?v=abc" } },
          ],
        },
      ],
    });
  });
});

describe("OpenRouter response extraction", () => {
  it("extracts string answers with schema validation", async () => {
    await expect(
      Effect.runPromise(
        extractAnswer({
          id: "gen",
          model: "model",
          object: "chat.completion",
          created: 0,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content: "answer" },
            },
          ],
        }),
      ),
    ).resolves.toBe("answer");
  });
});
