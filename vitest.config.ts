import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/dist-smoke.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["index.ts", "src/**/*.ts"],
      exclude: ["dist/**", "tests/**"]
    }
  }
});
