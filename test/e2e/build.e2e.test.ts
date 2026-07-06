import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const run = async (command: ReadonlyArray<string>) => {
  const [bin, ...args] = command;
  if (bin === undefined) throw new Error("missing command");
  const proc = spawn(bin, args, {
    cwd: process.cwd(),
    env: process.env,
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

describe("built CLI e2e", () => {
  it("builds one executable JS file and runs dry-run", async () => {
    const build = await run(["bun", "run", "build"]);
    expect(build.exitCode, build.stderr).toBe(0);
    await access(join(process.cwd(), "dist", "askvid.js"));

    const mcpHelp = await run(["node", "dist/askvid.js", "mcp", "--help"]);
    expect(mcpHelp.exitCode, mcpHelp.stderr).toBe(0);
    expect(mcpHelp.stdout).toContain("USAGE");
    expect(mcpHelp.stdout).toContain("askvid mcp [flags]");

    const dir = await mkdtemp(join(tmpdir(), "askvid-built-e2e-"));
    try {
      const video = join(dir, "tiny.mp4");
      await writeFile(video, Buffer.from("dry-run"));

      const result = await run(["node", "dist/askvid.js", "--dry-run", video, "summarize this"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).dryRun).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
