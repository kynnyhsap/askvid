import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.e2e.test.ts"],
    testTimeout: 30_000,
  },
});
