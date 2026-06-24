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
  it("requires OPENROUTER_API_KEY for real requests", async () => {
    const result = await Effect.runPromiseExit(loadRuntimeConfig.pipe(withEnv({})));
    expect(result._tag).toBe("Failure");
  });

  it("loads defaults and cache settings", async () => {
    const config = await Effect.runPromise(
      loadRuntimeConfig.pipe(
        withEnv({
          OPENROUTER_API_KEY: "secret",
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
