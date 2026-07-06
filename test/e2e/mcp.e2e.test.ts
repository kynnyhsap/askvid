import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

type JsonRpcId = number | string;

interface JsonRpcMessage {
  readonly id?: JsonRpcId;
  readonly result?: unknown;
  readonly error?: unknown;
}

interface PendingRequest {
  readonly resolve: (message: JsonRpcMessage) => void;
  readonly reject: (error: Error) => void;
}

const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asJsonRpcMessage = (value: unknown): JsonRpcMessage => {
  if (!isJsonRecord(value)) {
    throw new Error(`Expected JSON-RPC object, got ${JSON.stringify(value)}`);
  }
  const id = value.id;
  return {
    ...(typeof id === "string" || typeof id === "number" ? { id } : {}),
    ...(Object.hasOwn(value, "result") ? { result: value.result } : {}),
    ...(Object.hasOwn(value, "error") ? { error: value.error } : {}),
  };
};

const withTimeout = async <A>(promise: Promise<A>, ms: number, label: string): Promise<A> => {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<A>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

const startMcpServer = () => {
  const proc = spawn("bun", ["cli", "mcp"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ASKVID_BACKEND: "test",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map<JsonRpcId, PendingRequest>();
  const stderrChunks: Array<Buffer> = [];
  let stdoutBuffer = "";
  let closed = false;

  const closedPromise = new Promise<void>((resolve) => {
    proc.once("close", () => {
      closed = true;
      for (const request of pending.values()) {
        request.reject(new Error(`MCP server exited early:\n${Buffer.concat(stderrChunks)}`));
      }
      pending.clear();
      resolve();
    });
  });

  proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    for (;;) {
      const newlineIndex = stdoutBuffer.indexOf("\n");
      if (newlineIndex === -1) return;

      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line.length === 0) continue;

      const message = asJsonRpcMessage(JSON.parse(line));
      if (message.id === undefined) continue;

      const request = pending.get(message.id);
      if (request !== undefined) {
        pending.delete(message.id);
        request.resolve(message);
      }
    }
  });

  const request = (id: JsonRpcId, method: string, params: unknown) =>
    withTimeout(
      new Promise<JsonRpcMessage>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      }),
      10_000,
      method,
    );

  const notify = (method: string, params: unknown) => {
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  };

  const stop = async () => {
    if (!proc.stdin.destroyed) proc.stdin.end();
    if (!closed) proc.kill("SIGTERM");
    await withTimeout(closedPromise, 5_000, "MCP server shutdown");
  };

  return { request, notify, stop };
};

describe("askvid MCP e2e", () => {
  it("lists and calls the ask_video tool over stdio", async () => {
    const server = startMcpServer();
    try {
      const initialize = await server.request(1, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "askvid-e2e", version: "0.0.0" },
      });
      expect(initialize.error).toBeUndefined();
      expect(initialize.result).toMatchObject({
        serverInfo: { name: "askvid" },
        capabilities: { tools: { listChanged: true } },
      });

      server.notify("notifications/initialized", {});

      const tools = await server.request(2, "tools/list", {});
      expect(tools.error).toBeUndefined();
      expect(tools.result).toMatchObject({
        tools: [
          {
            name: "ask_video",
            inputSchema: {
              required: ["videoPath", "query"],
            },
          },
        ],
      });

      const call = await server.request(3, "tools/call", {
        name: "ask_video",
        arguments: {
          videoPath: "https://www.youtube.com/watch?v=hSNCUtoO3K4",
          query: "what is this video about?",
        },
      });
      expect(call.error).toBeUndefined();
      expect(call.result).toEqual({
        content: [{ type: "text", text: "test answer for: what is this video about?" }],
      });
    } finally {
      await server.stop();
    }
  });
});
