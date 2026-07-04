import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import packageJson from "../../package.json" with { type: "json" };

import { DryRunReport } from "../../src/domain.ts";

const runCli = async (
  args: ReadonlyArray<string>,
  env: Record<string, string | undefined> = {},
) => {
  const proc = spawn("bun", ["cli", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutChunks: Array<Buffer> = [];
  const stderrChunks: Array<Buffer> = [];
  proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  const exitCode = await new Promise<number | null>((resolve) => proc.on("close", resolve));
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  return { stdout, stderr, exitCode };
};

describe("askvid CLI e2e", () => {
  it("prints help", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("askvid");
    expect(result.stdout).toContain("video-source");
    expect(result.stdout).toContain("question");
  });

  it("prints the package version", async () => {
    const result = await runCli(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(`askvid v${packageJson.version}`);
  });

  it("runs dry-run against a local video path without an API key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "askvid-e2e-"));
    try {
      const video = join(dir, "tiny.mp4");
      await writeFile(video, Buffer.from("not a real mp4; dry-run only"));

      const result = await runCli(["--dry-run", video, "summarize this"]);
      expect(result.exitCode).toBe(0);
      const report = Schema.decodeUnknownSync(DryRunReport)(JSON.parse(result.stdout));
      expect(report.dryRun).toBe(true);
      expect(report.backend).toBe("openrouter");
      expect(report.source.kind).toBe("local");
      expect(report.source.videoUrlPreview).toContain("<local-video-bytes>");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints debug logs to stderr in dry-run mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "askvid-e2e-"));
    try {
      const video = join(dir, "tiny.mp4");
      await writeFile(video, Buffer.from("dry-run"));

      const result = await runCli(["--debug", "--dry-run", video, "summarize this"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("dry-run enabled");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs dry-run against a remote video URL without downloading it", async () => {
    const result = await runCli([
      "--dry-run",
      "https://cdn.example.test/tiny.mp4",
      "summarize this",
    ]);

    expect(result.exitCode, result.stderr).toBe(0);
    const report = Schema.decodeUnknownSync(DryRunReport)(JSON.parse(result.stdout));
    expect(report.source.kind).toBe("remote");
    expect(report.source.willDownload).toBe(true);
    expect(report.source.willReadFile).toBe(false);
    expect(report.source.videoUrlPreview).toContain("<downloaded-remote-video>");
  });

  it("runs the real ask path with the test backend", async () => {
    const result = await runCli(
      ["https://www.youtube.com/watch?v=hSNCUtoO3K4", "what is this video about?"],
      { ASKVID_BACKEND: "test" },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("test answer for: what is this video about?");
  });
});
