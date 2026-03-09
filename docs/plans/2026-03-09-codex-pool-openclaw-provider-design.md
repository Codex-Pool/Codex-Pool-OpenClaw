# Codex-Pool OpenClaw Provider 设计文档

**日期：** 2026-03-09

## 目标

在 `OpenClaw` 中新增一个专门面向 `Codex-Pool` 的自定义 provider/plugin，使其：

- 保留 Codex 风格的请求体、SSE 事件流和工具调用语义。
- 允许直接使用 `cp_...` 形式的本地代理 key。
- 不再把 `cp_...` 当成 ChatGPT OAuth JWT 去解析 `chatgpt_account_id`。
- 能在需要时显式附带 `chatgpt-account-id`，但不把它作为强制前置条件。

## 背景与根因

当前 `OpenClaw` 内置的 `openai-codex-responses` provider 会先从 `apiKey` 里提取 `chatgpt_account_id`。这适用于 ChatGPT/Codex OAuth token，但不适用于 `Codex-Pool` 暴露出来的 `cp_...` 代理 key。结果是请求还没发到 `Codex-Pool`，就在本地报出 `Failed to extract accountId from token`。

另一方面，本机 `Codex CLI` 能正常访问 `Codex-Pool`，说明：

- `Codex-Pool` 接口本身不是完全不可用。
- 真正不兼容的是 `OpenClaw` 当前选择的 provider 认证假设，而不是“Codex 风格请求体”本身。

## 方案对比

### 方案 A：直接补丁 OpenClaw 内置 `openai-codex-responses`

**优点**

- 最短路径修掉当前问题。

**缺点**

- 和 OpenClaw 上游升级强绑定。
- 本地 patch 难复用，回归成本高。
- 不利于把 `Codex-Pool` 适配逻辑收敛成独立组件。

### 方案 B：独立实现 `codex-pool-codex` 自定义 provider（推荐）

**优点**

- 与 OpenClaw 上游解耦。
- 可以只替换认证/头部处理，保留 Codex 请求与流式协议。
- 方便单元测试和回归测试。
- 未来可以扩展为公开插件或内部标准适配层。

**缺点**

- 需要补最小插件装配与加载路径。

### 方案 C：额外再放一层 HTTP shim

**优点**

- 不必触碰 OpenClaw provider 层。

**缺点**

- 链路更长，调试更难。
- 问题本质仍在 provider 适配层，只是被转移出去。

## 推荐架构

采用 **方案 B**：在独立仓库 `~/Codex-Pool-OpenClaw` 中实现一个最小可用的 `codex-pool-codex` provider。

仓库职责：

1. 提供一个可注册到 OpenClaw 运行时的自定义 API provider。
2. 复用/对齐 `openai-codex-responses` 的请求体和事件流映射。
3. 替换掉“从 token 解析 accountId”的认证逻辑。
4. 提供最小接入文档，说明如何在 OpenClaw 配置中启用。

## Provider 行为设计

### 1. 请求路径

默认请求目标为：

- `http://127.0.0.1:8091/backend-api/codex/responses`

同时保留可配置能力，允许未来切换到：

- `/v1/responses`
- 其他兼容路径

### 2. 认证与头部

provider 的认证规则改为：

- `Authorization: Bearer <cp_key>` 直接透传 `cp_...`
- **不** 从 `cp_...` 中提取 `chatgpt_account_id`
- 若配置中明确给出 `chatgpt-account-id`，则附带该头
- 若未配置，则不附带该头，由 `Codex-Pool` 自己决定是否需要

### 3. 请求体

尽量保持与 `openai-codex-responses` 一致，包括：

- `model`
- `store: false`
- `stream: true`
- `instructions`
- `input`
- `text.verbosity`
- `include`
- `tool_choice`
- `parallel_tool_calls`
- `reasoning`

也就是说，本插件改的是“认证与传输入口”，不是“上层消息语义”。

### 4. 流式响应

保持与现有 `pi-ai` 事件模型兼容：

- 解析 SSE `data:` 事件
- 识别 `response.failed`
- 识别 `response.done` / `response.completed`
- 逐步生成 `text_delta`、`toolcall_*`、`thinking_*` 等消息

## 仓库结构

计划采用最小 Node ESM 工程：

- `src/provider/`：Codex-Pool provider 主逻辑
- `src/plugin/`：OpenClaw 注册入口
- `tests/`：头部、请求体、SSE 行为测试
- `docs/plans/`：设计与实现计划

## 测试策略

### 单元测试

覆盖以下行为：

1. `cp_...` key 不触发 accountId 解析错误
2. 默认头部只带 `Authorization`
3. 显式配置时才附带 `chatgpt-account-id`
4. URL 拼接正确
5. 请求体保留 Codex 风格字段

### 集成测试

使用本地 mock SSE 服务验证：

1. 成功流式响应
2. `response.failed` 错误映射
3. 非 2xx 响应错误映射

### 后续手工 smoke test

在本地 OpenClaw 中启用插件后，用最小 `ping` 消息验证：

1. 不再出现 `Failed to extract accountId from token`
2. 请求能到达 `Codex-Pool`
3. 若后端账号池有问题，OpenClaw 看到的是后端真实错误，而不是本地 provider 误解析错误

## 非目标

本次不做：

- 重写 `Codex-Pool` 的账号池调度逻辑
- 一次性解决所有 `upstream request failed`
- 改造 OpenClaw 上游插件生态
- 支持除 `Codex-Pool` 之外的其他代理格式

## 成功标准

满足以下条件即视为本阶段完成：

1. 本地测试可证明 `cp_...` key 不再触发 accountId 提取错误
2. 插件能把 Codex 风格请求成功发到 `Codex-Pool`
3. OpenClaw 可通过插件配置实际调用该 provider
4. 文档说明清晰，后续可在此基础上继续扩展
