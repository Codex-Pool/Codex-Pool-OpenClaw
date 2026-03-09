import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function readJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  return JSON.parse(raw);
}

describe("OpenClaw package metadata", () => {
  test("package.json 暴露 openclaw.extensions 供官方插件安装流程发现", async () => {
    const pkg = await readJson("package.json");

    expect(pkg.openclaw?.extensions).toEqual(["./src/openclaw-plugin.js"]);
  });

  test("openclaw.plugin.json 声明合法插件 id 与 provider", async () => {
    const manifest = await readJson("openclaw.plugin.json");

    expect(manifest).toMatchObject({
      id: "codex-pool-openclaw",
      providers: ["codex-pool"]
    });
    expect(manifest.configSchema).toEqual({
      type: "object",
      additionalProperties: false,
      properties: {}
    });
  });
});
