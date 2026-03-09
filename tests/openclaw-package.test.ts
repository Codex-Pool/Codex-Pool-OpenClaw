import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function readJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  return JSON.parse(raw);
}

async function pathExists(relativePath) {
  try {
    await fs.access(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

describe("OpenClaw package metadata", () => {
  test("package.json 暴露 dist 下的 openclaw.extensions 供官方插件安装流程发现", async () => {
    const pkg = await readJson("package.json");

    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg.exports).toMatchObject({
      ".": "./dist/index.js",
      "./preload": "./dist/src/preload.js"
    });
    expect(pkg.openclaw?.extensions).toEqual(["./dist/src/openclaw-plugin.js"]);
  });

  test("package.json 提供完整的构建与质量脚本", async () => {
    const pkg = await readJson("package.json");

    expect(pkg.scripts).toMatchObject({
      build: expect.any(String),
      typecheck: expect.any(String),
      lint: expect.any(String),
      format: expect.any(String),
      "format:check": expect.any(String),
      test: expect.any(String),
      coverage: expect.any(String),
      ci: expect.any(String)
    });
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

  test("核心入口源码已迁移到 TypeScript", async () => {
    await expect(pathExists("index.ts")).resolves.toBe(true);
    await expect(pathExists("src/index.ts")).resolves.toBe(true);
    await expect(pathExists("src/preload.ts")).resolves.toBe(true);
    await expect(pathExists("src/openclaw-plugin.ts")).resolves.toBe(true);
  });

  test("低风险 provider 基础模块已迁移到 TypeScript", async () => {
    await expect(pathExists("src/provider/auth.ts")).resolves.toBe(true);
    await expect(pathExists("src/provider/json-parse.ts")).resolves.toBe(true);
    await expect(pathExists("src/provider/sanitize-unicode.ts")).resolves.toBe(
      true
    );
    await expect(pathExists("src/provider/simple-options.ts")).resolves.toBe(
      true
    );
    await expect(pathExists("src/provider/event-stream.ts")).resolves.toBe(
      true
    );
  });

  test("中风险 provider 模块已迁移到 TypeScript", async () => {
    await expect(pathExists("src/openclaw/provider-auth.ts")).resolves.toBe(
      true
    );
    await expect(pathExists("src/provider/request.ts")).resolves.toBe(true);
  });

  test("高风险核心模块已迁移到 TypeScript", async () => {
    await expect(
      pathExists("src/provider/transform-messages.ts")
    ).resolves.toBe(true);
    await expect(pathExists("src/provider/responses-shared.ts")).resolves.toBe(
      true
    );
    await expect(pathExists("src/provider/stream.ts")).resolves.toBe(true);
    await expect(pathExists("src/plugin/register.ts")).resolves.toBe(true);
  });

  test("测试文件与 Vitest 配置已迁移到 TypeScript", async () => {
    await expect(pathExists("vitest.config.ts")).resolves.toBe(true);
    await expect(pathExists("tests/openclaw-package.test.ts")).resolves.toBe(
      true
    );
    await expect(pathExists("tests/openclaw-plugin.test.ts")).resolves.toBe(
      true
    );
    await expect(pathExists("tests/plugin-register.test.ts")).resolves.toBe(
      true
    );
    await expect(pathExists("tests/preload.test.ts")).resolves.toBe(true);
    await expect(pathExists("tests/provider-auth-flow.test.ts")).resolves.toBe(
      true
    );
    await expect(pathExists("tests/provider-auth.test.ts")).resolves.toBe(true);
    await expect(pathExists("tests/provider-request.test.ts")).resolves.toBe(
      true
    );
    await expect(pathExists("tests/provider-stream.test.ts")).resolves.toBe(
      true
    );

    const configModule = await import(
      pathToFileURL(path.join(repoRoot, "vitest.config.ts")).href
    );
    const config = configModule.default;

    expect(config.test.include).toEqual(["tests/**/*.test.ts"]);
    expect(config.test.coverage).toMatchObject({
      provider: "v8",
      reporter: ["text", "html", "json-summary"]
    });
  });

  test("包元数据与发布工作流已准备好 tag 驱动 npm publish", async () => {
    const pkg = await readJson("package.json");

    expect(pkg.private).toBe(false);
    expect(pkg.files).toEqual([
      "dist",
      "README.md",
      "openclaw.plugin.json",
      "package.json"
    ]);
    expect(pkg.publishConfig).toEqual({
      access: "public"
    });
    expect(pkg.packageManager).toBe("npm@11.8.0");
    expect(pkg.engines).toEqual({
      node: ">=20"
    });
    expect(pkg.scripts).toMatchObject({
      "smoke:dist": expect.any(String)
    });

    await expect(pathExists(".github/workflows/ci.yml")).resolves.toBe(true);
    await expect(pathExists(".github/workflows/publish.yml")).resolves.toBe(
      true
    );
    await expect(pathExists("tests/dist-smoke.test.ts")).resolves.toBe(true);
  });
});
