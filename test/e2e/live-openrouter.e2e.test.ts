import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

const runLive = async () => {
  const proc = spawn(
    "bun",
    [
      "cli",
      "https://www.youtube.com/watch?v=hSNCUtoO3K4",
      "In one short sentence, what is this video about?",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ASKVID_RESPONSE_CACHE: process.env.ASKVID_RESPONSE_CACHE ?? "1",
        ASKVID_RESPONSE_CACHE_TTL: process.env.ASKVID_RESPONSE_CACHE_TTL ?? "86400",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const stdoutChunks: Array<Buffer> = [];
  const stderrChunks: Array<Buffer> = [];
  proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  const exitCode = await new Promise<number | null>((resolve) => proc.on("close", resolve));
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  return { stdout, stderr, exitCode };
};

describe("live OpenRouter e2e", () => {
  it.runIf(process.env.ASKVID_LIVE_E2E === "1")(
    "calls the real CLI and returns an answer",
    async () => {
      const result = await runLive();
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout.trim().length).toBeGreaterThan(20);
    },
    120_000,
  );
});
