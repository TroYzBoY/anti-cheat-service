import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    setupFiles: ["lib/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` is a Next.js marker that explodes in plain Node;
      // alias it to a no-op so server modules can be unit-tested.
      "server-only": path.resolve(__dirname, "lib/__mocks__/server-only.ts"),
    },
  },
});
