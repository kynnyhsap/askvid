import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  AppConfig,
  BackendName,
  ResponseCacheConfig,
  RuntimeConfig,
  type AppConfig as AppConfigType,
  type RuntimeConfig as RuntimeConfigType,
} from "./domain.ts";

export type { ResponseCacheConfig } from "./domain.ts";

export const DEFAULT_MODEL = "google/gemini-3.1-pro-preview";
export const DEFAULT_MAX_TOKENS = 6000;
export const MAX_INLINE_BYTES = 100 * 1024 * 1024;

const decodeConfig =
  <S extends Schema.Top>(schema: S) =>
  (config: Config.Config<unknown>): Config.Config<S["Type"]> =>
    config.pipe(
      Config.mapOrFail((value) =>
        (
          Schema.decodeUnknownEffect(schema)(value) as Effect.Effect<S["Type"], Schema.SchemaError>
        ).pipe(Effect.mapError((error) => new Config.ConfigError(error))),
      ),
    ) as Config.Config<S["Type"]>;

const positiveInt = (name: string) =>
  Config.int(name).pipe(
    Config.mapOrFail((value) =>
      Schema.decodeUnknownEffect(Schema.Int.check(Schema.isGreaterThan(0)))(value).pipe(
        Effect.mapError((error) => new Config.ConfigError(error)),
      ),
    ),
  );

const responseCacheConfig = Config.all({
  enabled: Config.boolean("ASKVID_RESPONSE_CACHE").pipe(Config.withDefault(false)),
  ttlSeconds: positiveInt("ASKVID_RESPONSE_CACHE_TTL").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  clear: Config.boolean("ASKVID_RESPONSE_CACHE_CLEAR").pipe(Config.withDefault(false)),
}).pipe(
  Config.map(({ enabled, ttlSeconds, clear }) => ({
    enabled,
    ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
    clear,
  })),
  decodeConfig(ResponseCacheConfig),
);

const backendConfig = Config.string("ASKVID_BACKEND").pipe(
  Config.withDefault("openrouter"),
  decodeConfig(BackendName),
);

const appConfigFields = {
  backend: backendConfig,
  model: Config.string("ASKVID_MODEL").pipe(Config.withDefault(DEFAULT_MODEL)),
  maxTokens: positiveInt("ASKVID_MAX_TOKENS").pipe(Config.withDefault(DEFAULT_MAX_TOKENS)),
  responseCache: responseCacheConfig,
  debug: Config.boolean("ASKVID_DEBUG").pipe(Config.withDefault(false)),
};

const openRouterApiKeyConfig = Config.redacted("ASKVID_OPENROUTER_API_KEY").pipe(
  Config.orElse(() => Config.redacted("OPENROUTER_API_KEY")),
);

export const appConfig = Config.all(appConfigFields).pipe(decodeConfig(AppConfig));

export const runtimeConfig = Config.all({
  ...appConfigFields,
  apiKey: openRouterApiKeyConfig,
}).pipe(decodeConfig(RuntimeConfig));

export const loadAppConfig: Effect.Effect<AppConfigType, Config.ConfigError> = appConfig;
export const loadRuntimeConfig: Effect.Effect<RuntimeConfigType, Config.ConfigError> =
  runtimeConfig;

export const testConfigProvider = (env: Record<string, string | undefined>) =>
  ConfigProvider.fromEnv({
    env: Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  });
