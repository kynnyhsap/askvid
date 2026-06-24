# askvid

Ask questions about a video from the command line. OpenRouter is the default
backend, and the CLI is wired through swappable Effect services.

```sh
bun askvid video.mp4 "what do you see at 3:12 in the top left corner?"
bun askvid https://some.com/video.mp4 "how many apples are in this video?"
bun askvid https://youtube.com/watch?v=alsdjhfkajs "summarize this"
```

The CLI shape is:

```sh
askvid [--dry-run] [--debug] <video-source> <question>
```

`video-source` can be a local path, `file://` URL, remote video URL, or YouTube URL.
With the OpenRouter backend, YouTube URLs are passed through directly. Local
files and non-YouTube remote videos are encoded as base64 data URLs, matching the
existing `pi-read-video` backend behavior.

## Local use

```sh
bun install
export OPENROUTER_API_KEY="sk-or-..."

bun cli video.mp4 "summarize this"
bun askvid --dry-run video.mp4 "summarize this"
```

`OPENROUTER_API_KEY` is required for real OpenRouter requests. `--dry-run` does
not call the model backend and does not require an API key.

Useful env vars:

- `ASKVID_DEBUG=1`: enable verbose stderr logs.
- `ASKVID_BACKEND=openrouter`: select the backend. Use `test` for deterministic
  local/e2e runs.
- `ASKVID_MODEL=google/gemini-3.1-pro-preview`: override the default model.
- `ASKVID_RESPONSE_CACHE=1`: send `X-OpenRouter-Cache: true`.
- `ASKVID_RESPONSE_CACHE_TTL=86400`: set response-cache TTL in seconds.
- `ASKVID_RESPONSE_CACHE_CLEAR=1`: refresh the current cache key.

## Build

```sh
bun run build
```

The build script invokes Bun's bundler and writes one executable JS file:

```sh
dist/askvid.js
```

## Install

After publishing:

```sh
npm install -g askvid
askvid https://youtube.com/watch?v=alsdjhfkajs "summarize this"
```

## Tests

```sh
bun run test
bun run test:e2e
```

Live OpenRouter e2e is opt-in:

```sh
ASKVID_LIVE_E2E=1 OPENROUTER_API_KEY="sk-or-..." ASKVID_RESPONSE_CACHE=1 bun run test:e2e
```

Response caching is practical for live e2e as long as the request body is
byte-identical: same API key, model, endpoint, streaming mode, request JSON
property order, prompt, and video URL/base64 bytes. YouTube URL e2e requests are
the easiest to cache because the video input string is stable.
