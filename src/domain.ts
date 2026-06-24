import * as Schema from "effect/Schema";

export const BackendName = Schema.Literals(["openrouter", "test"]);
export type BackendName = typeof BackendName.Type;

export const ResponseCacheConfig = Schema.Struct({
  enabled: Schema.Boolean,
  ttlSeconds: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  clear: Schema.Boolean,
});
export type ResponseCacheConfig = typeof ResponseCacheConfig.Type;

export const AppConfig = Schema.Struct({
  backend: BackendName,
  model: Schema.String.check(Schema.isNonEmpty()),
  maxTokens: Schema.Int.check(Schema.isGreaterThan(0)),
  responseCache: ResponseCacheConfig,
  debug: Schema.Boolean,
});
export type AppConfig = typeof AppConfig.Type;

export const RuntimeConfig = Schema.Struct({
  ...AppConfig.fields,
  apiKey: Schema.Redacted(Schema.String.check(Schema.isNonEmpty()), { disallowJsonEncode: true }),
});
export type RuntimeConfig = typeof RuntimeConfig.Type;

export const VideoSourceKind = Schema.Literals(["youtube", "remote", "local"]);
export type VideoSourceKind = typeof VideoSourceKind.Type;

export const ResolvedVideoSource = Schema.Struct({
  kind: VideoSourceKind,
  input: Schema.String,
  videoUrl: Schema.String,
  bytes: Schema.optionalKey(Schema.Number),
  mimeType: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
});
export type ResolvedVideoSource = typeof ResolvedVideoSource.Type;

export const InspectedVideoSource = Schema.Struct({
  kind: VideoSourceKind,
  input: Schema.String,
  videoUrlPreview: Schema.String,
  bytes: Schema.optionalKey(Schema.Number),
  mimeType: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
  willDownload: Schema.Boolean,
  willReadFile: Schema.Boolean,
});
export type InspectedVideoSource = typeof InspectedVideoSource.Type;

export const AskVideoInput = Schema.Struct({
  videoSource: Schema.String,
  question: Schema.String,
  cwd: Schema.String,
  debug: Schema.Boolean,
});
export type AskVideoInput = typeof AskVideoInput.Type;

export const BackendVideoRequest = Schema.Struct({
  video: ResolvedVideoSource,
  question: Schema.String,
});
export type BackendVideoRequest = typeof BackendVideoRequest.Type;

export const CacheMetadata = Schema.Struct({
  status: Schema.optionalKey(Schema.String),
  age: Schema.optionalKey(Schema.String),
  ttl: Schema.optionalKey(Schema.String),
  generationId: Schema.optionalKey(Schema.String),
});
export type CacheMetadata = typeof CacheMetadata.Type;

export const BackendVideoAnswer = Schema.Struct({
  answer: Schema.String,
  model: Schema.String,
  status: Schema.optionalKey(Schema.Number),
  metadata: CacheMetadata,
});
export type BackendVideoAnswer = typeof BackendVideoAnswer.Type;

export const VideoAnswer = Schema.Struct({
  answer: Schema.String,
  model: Schema.String,
  sourceKind: VideoSourceKind,
  latencyMs: Schema.Number,
  bytes: Schema.optionalKey(Schema.Number),
  status: Schema.optionalKey(Schema.Number),
  metadata: CacheMetadata,
});
export type VideoAnswer = typeof VideoAnswer.Type;

export const DryRunReport = Schema.Struct({
  dryRun: Schema.Literal(true),
  backend: BackendName,
  model: Schema.String,
  maxTokens: Schema.Number,
  source: InspectedVideoSource,
  question: Schema.String,
  responseCache: ResponseCacheConfig,
});
export type DryRunReport = typeof DryRunReport.Type;
