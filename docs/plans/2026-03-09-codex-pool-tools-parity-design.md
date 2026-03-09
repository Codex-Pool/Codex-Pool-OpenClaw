# Codex-Pool OpenClaw 工具透传与低风险对齐设计文档

**日期：** 2026-03-09

## 目标

修复 `Codex-Pool-OpenClaw` 在使用 `cp` provider 时无法触发工具调用的问题，并顺手补齐一批与官方 `openai-codex-responses` provider 相比明显缺失、且风险较低的请求层能力。

本次目标包含两部分：

1. 让 `context.tools` 能正确进入发往 Codex-Pool 的请求体，恢复工具调用能力。
2. 补齐一批低风险差异，减少后续再踩“功能 silently missing”的坑。

## 根因

日志显示当前 `cp` 会话能正常流式产出纯文本，但同一轮完全没有任何 `tool call:` 日志，说明模型层没有发起工具请求，不是网关工具系统整体失效。

对比官方 provider 代码后，确认当前插件请求体构造缺少：

- `body.tools`
- `temperature`
- `reasoning effort` 的官方 clamp 逻辑

同时 headers 层还缺少：

- `session_id`

其中最关键的缺口是 `body.tools`，因为仅设置 `tool_choice: "auto"` 并不足以让模型调用工具；模型还必须拿到工具定义本身。

## 方案对比

### 方案 A：只补 `body.tools`

**优点**

- 改动最小
- 直接命中当前问题

**缺点**

- 其他明显缺口继续保留
- 后续还会反复遇到“官方有、插件没有”的请求层差异

### 方案 B：补 `tools` 并顺手补低风险请求层差异（推荐）

**优点**

- 一次性把最明显的兼容缺口补平
- 风险仍然可控，范围集中在 request/header 构造层
- 能减少后续二次返工

**缺点**

- 需要多补几条测试

### 方案 C：追求与官方 provider 全量对齐

**优点**

- 理论上兼容性最好

**缺点**

- 会把范围扩大到消息规范化、stream 事件映射、usage 统计等多个层面
- 当前不符合“低风险、小步快跑”的节奏

## 推荐方案

采用 **方案 B**。

本次只修改 request/header 构造，不碰 stream parser 和 provider 注册层。范围控制为：

1. `context.tools -> body.tools`
2. `options.temperature -> body.temperature`
3. `reasoning effort` 官方 clamp 逻辑
4. `options.sessionId -> session_id` header

## 设计细节

### 1. 工具定义透传

在 `buildCodexPoolRequestBody()` 中，如果 `context.tools` 存在，则把工具列表映射为 Responses API 兼容格式：

- `type: "function"`
- `name`
- `description`
- `parameters`
- `strict: null`

### 2. 低风险请求字段对齐

- `temperature`：仅在显式传入时下发
- `reasoning`：保留现有字段，同时补官方 clamp
  - `gpt-5.2*` / `gpt-5.3*` 的 `minimal -> low`
  - `gpt-5.1` 的 `xhigh -> high`
  - `gpt-5.1-codex-mini` 的 effort 收敛

### 3. Header 对齐

在 `buildCodexPoolHeaders()` 中补：

- `session_id`

这样更贴近官方 codex provider 行为，也有利于后端按 session 维度做排查。

## 非目标

这次不做：

1. 不补全所有官方 stream 事件映射
2. 不补 usage/cost 统计
3. 不补 reasoning item / thinkingSignature 的完整恢复
4. 不补 tool call id 的全量 sanitize / hash 策略
5. 不改 `originator` 和 `User-Agent` 风格

## 测试策略

### 单元测试

在现有测试基础上新增：

1. `context.tools` 会被写入 `body.tools`
2. `temperature` 会被写入请求体
3. `reasoning effort` 会按官方规则 clamp
4. `session_id` 会写入 headers

### 回归测试

跑：

- `npm test -- tests/provider-request.test.js`
- `npm test -- tests/provider-auth.test.js`
- `npm test`

## 差异审计输出

这轮修完后，再基于与官方 provider 的对比，输出一份“仍未对齐但本次不改”的差异清单，供下一轮排优先级。

## 成功标准

满足以下条件即视为完成：

1. `cp` provider 请求体会带上 `tools`
2. 相关新增测试先失败、后通过
3. 全量测试通过
4. 能明确列出当前仍缺的非低风险能力
