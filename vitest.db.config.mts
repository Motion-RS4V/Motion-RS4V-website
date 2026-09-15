import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Booking engine against the real database. Slow (round trips to Mumbai) and sequential by design.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    setupFiles: ["./scripts/load-env.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
