import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Fast unit tests. The live-database suite has its own config: vitest.db.config.mts (npm run test:db).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.db.test.ts", "node_modules/**"],
  },
});
