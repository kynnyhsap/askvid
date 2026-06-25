---
name: askvid
description: Read, summarize, debug, verify, or extract facts from local videos, screen recordings, remote video URLs, and YouTube URLs using the askvid CLI. Use when the user asks to inspect a video, understand a UI recording, pull timestamps, summarize a YouTube video, or verify visual behavior after a change.
---

# askvid

Use `askvid` when a task depends on video content. It sends a video plus one question to an OpenRouter video-capable model and prints the answer.

## Quick Start

```bash
bunx askvid "<video-source>" "<question>"
```

`<video-source>` can be:

- A local path: `"/Users/me/Desktop/demo.mp4"`
- A `file://` URL
- A remote video URL
- A YouTube URL

Prefer quoted local paths for files with spaces. YouTube URLs are passed through directly. Local files and non-YouTube remote videos are uploaded inline as base64 and must be under 100 MiB.

## Requirements

Real requests require:

```bash
export ASKVID_OPENROUTER_API_KEY="sk-or-..."
```

Check source handling without using the model:

```bash
bunx askvid --dry-run "<video-source>" "summarize this"
```

Use debug logs when a request fails or caching behavior matters:

```bash
bunx askvid --debug "<video-source>" "<question>"
```

## Models

Default model:

```bash
google/gemini-3.1-pro-preview
```

`askvid` does not keep a model allowlist. It passes `ASKVID_MODEL` directly to OpenRouter, so the available models are the current OpenRouter models whose `input_modalities` include `video`.

List current video-capable models:

```bash
curl -sS https://openrouter.ai/api/v1/models | bun --eval '
const body = await new Response(Bun.stdin.stream()).json();
for (const m of body.data.filter((m) => m.architecture?.input_modalities?.includes("video"))) {
  console.log(m.id);
}
'
```

Override the model:

```bash
ASKVID_MODEL="google/gemini-3.1-pro-preview" bunx askvid "<video-source>" "<question>"
```

Keep the default unless the user asks to compare models or a model-specific failure requires a retry. For long videos, prefer a narrow prompt before changing models.

## Common Workflows

### First-pass video read

```bash
bunx askvid "<video-source>" \
  "Describe what is visible in this video. Include relevant text, UI elements, actions, and a brief timeline."
```

### UI bug from a screen recording

```bash
bunx askvid "<recording.mp4>" \
  "Describe the UI bug with timestamps. Focus on what moves, when it happens, visible text/states, likely cause, and the fix needed."
```

### Before/after verification

```bash
bunx askvid "<before.mov>" \
  "Analyze this baseline recording. Describe the visual issue with timestamps and likely cause."

bunx askvid "<after.mov>" \
  "Analyze this recording after the fix. Confirm whether the previous issue is gone, mention timestamps, and note any remaining problem."
```

### YouTube summary

```bash
bunx askvid "https://youtube.com/watch?v=..." \
  "Summarize the main topic, key points, notable claims, actionable takeaways, and timestamps. Focus on what a viewer should learn or do after watching."
```

### Business or research extraction

```bash
bunx askvid "<video-source>" \
  "Extract the topic, core argument, concrete facts, numbers, formulas, benchmarks, examples, caveats, and action items. Be concise and avoid filler."
```

### Rendered video QA

```bash
bunx askvid "<demo.mp4>" \
  "Verify this rendered video. Summarize what is shown, whether all expected steps appear, and whether text is legible enough."
```

## Prompting Rules

- Ask for timestamps when debugging UI, reviewing long videos, or verifying behavior.
- Name the exact thing to inspect: layout shift, white flash, pinch zoom, bottom sheet overlay, visible text, numbers, quotes, or action items.
- Keep long-video prompts targeted first; exhaustive notes can be slower and more expensive.
- For local files, quote paths with spaces instead of relying on shell escaping.
- If OpenRouter returns a transient `502` or timeout, retry once. If it repeats, narrow the prompt or use a shorter clip.

## Environment

```bash
ASKVID_OPENROUTER_API_KEY   # required for real OpenRouter requests
ASKVID_MODEL                # model override, defaults to google/gemini-3.1-pro-preview
ASKVID_MAX_TOKENS           # answer budget, defaults to 6000
ASKVID_DEBUG=1              # verbose stderr logs
ASKVID_RESPONSE_CACHE=1     # enable OpenRouter response cache header
ASKVID_RESPONSE_CACHE_TTL=86400
ASKVID_RESPONSE_CACHE_CLEAR=1
ASKVID_BACKEND=openrouter   # default; use test only for deterministic local/e2e checks
```
