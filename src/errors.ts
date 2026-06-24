import * as Schema from "effect/Schema";

export class SourceError extends Schema.TaggedErrorClass<SourceError>()("SourceError", {
  message: Schema.String,
}) {}

export class FileTooLargeError extends Schema.TaggedErrorClass<FileTooLargeError>()(
  "FileTooLargeError",
  {
    message: Schema.String,
    bytes: Schema.Number,
    maxBytes: Schema.Number,
  },
) {}

export class BackendError extends Schema.TaggedErrorClass<BackendError>()("BackendError", {
  message: Schema.String,
}) {}

export class NoAnswerError extends Schema.TaggedErrorClass<NoAnswerError>()("NoAnswerError", {
  message: Schema.String,
}) {}

export type AskvidError = SourceError | FileTooLargeError | BackendError | NoAnswerError;

export const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { readonly message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return String(error);
};
