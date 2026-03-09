import { describe, expect, test } from "vitest";

import { parseStreamingJson } from "../src/provider/json-parse.js";
import {
  buildBaseOptions,
  calculateCost,
  clampReasoning,
  supportsXhigh
} from "../src/provider/simple-options.js";

describe("parseStreamingJson", () => {
  test("空字符串返回空对象", () => {
    expect(parseStreamingJson("")).toEqual({});
  });

  test("完整 JSON 会被直接解析", () => {
    expect(parseStreamingJson('{"city":"北京"}')).toEqual({ city: "北京" });
  });

  test("部分 JSON 会走 partial-json 解析", () => {
    expect(parseStreamingJson('{"city":"北京"')).toEqual({ city: "北京" });
  });
});

describe("simple-options helpers", () => {
  test("buildBaseOptions 会组合默认 maxTokens 和显式字段", () => {
    expect(
      buildBaseOptions(
        { id: "gpt-5.4", maxTokens: 50000 },
        { temperature: 0.2, sessionId: "s1" },
        "cp_key"
      )
    ).toMatchObject({
      temperature: 0.2,
      maxTokens: 32000,
      apiKey: "cp_key",
      sessionId: "s1"
    });
  });

  test("clampReasoning 与 supportsXhigh 会按模型规则处理", () => {
    expect(clampReasoning("xhigh")).toBe("high");
    expect(clampReasoning("low")).toBe("low");
    expect(supportsXhigh({ id: "gpt-5.2-codex" })).toBe(true);
    expect(
      supportsXhigh({ id: "claude-opus-4.6", api: "anthropic-messages" })
    ).toBe(true);
    expect(supportsXhigh({ id: "gpt-5.4" })).toBe(false);
  });

  test("calculateCost 会回写 usage.cost", () => {
    const usage = {
      input: 1000,
      output: 500,
      cacheRead: 200,
      cacheWrite: 100,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    };

    const cost = calculateCost(
      {
        id: "gpt-5.4",
        cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 }
      },
      usage
    );

    expect(cost.input).toBeCloseTo(0.001);
    expect(cost.output).toBeCloseTo(0.001);
    expect(cost.cacheRead).toBeCloseTo(0.0006);
    expect(cost.cacheWrite).toBeCloseTo(0.0004);
    expect(cost.total).toBeCloseTo(0.003);
  });
});
