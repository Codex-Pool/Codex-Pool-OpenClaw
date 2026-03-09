import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

describe("dist smoke", () => {
  test("构建产物包含可发布的核心入口", async () => {
    await expect(pathExists("dist/index.js")).resolves.toBe(true);
    await expect(pathExists("dist/index.d.ts")).resolves.toBe(true);
    await expect(pathExists("dist/src/openclaw-plugin.js")).resolves.toBe(true);
    await expect(pathExists("dist/src/preload.js")).resolves.toBe(true);

    const distEntry = await import(
      pathToFileURL(path.join(repoRoot, "dist/index.js")).href
    );

    expect(typeof distEntry.default).toBe("function");
    expect(typeof distEntry.buildCodexPoolHeaders).toBe("function");
    expect(typeof distEntry.buildCodexPoolRequestBody).toBe("function");
    expect(typeof distEntry.streamCodexPoolCodexResponses).toBe("function");
  });
});
