import * as Effect from "effect/Effect";
import * as ConfigProvider from "effect/ConfigProvider";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  loadAppConfig,
  loadRuntimeConfig,
  testConfigProvider,
} from "../src/config.ts";

const withEnv = (env: Record<string, string | undefined>) =>
  Effect.provideService(ConfigProvider.ConfigProvider, testConfigProvider(env));

describe("runtime config", () => {
  it("requires an OpenRouter API key for real requests", async () => {
    const result = await Effect.runPromiseExit(loadRuntimeConfig.pipe(withEnv({})));
    expect(result._tag).toBe("Failure");
  });

  it("does not read the generic OpenRouter API key env var", async () => {
    const result = await Effect.runPromiseExit(
      loadRuntimeConfig.pipe(withEnv({ OPENROUTER_API_KEY: "secret" })),
    );
    expect(result._tag).toBe("Failure");
  });

  it("loads the askvid-specific API key env var with defaults and cache settings", async () => {
    const config = await Effect.runPromise(
      loadRuntimeConfig.pipe(
        withEnv({
          ASKVID_OPENROUTER_API_KEY: "secret",
          ASKVID_RESPONSE_CACHE: "true",
          ASKVID_RESPONSE_CACHE_TTL: "120",
          ASKVID_DEBUG: "true",
        }),
      ),
    );

    expect(config.backend).toBe("openrouter");
    expect(config.model).toBe(DEFAULT_MODEL);
    expect(config.maxTokens).toBe(DEFAULT_MAX_TOKENS);
    expect(config.responseCache).toEqual({ enabled: true, ttlSeconds: 120, clear: false });
    expect(config.debug).toBe(true);
  });

  it("loads dry-run config without an API key", async () => {
    const config = await Effect.runPromise(
      loadAppConfig.pipe(withEnv({ ASKVID_MODEL: "model/x", ASKVID_BACKEND: "test" })),
    );
    expect(config.model).toBe("model/x");
    expect(config.backend).toBe("test");
  });
});
