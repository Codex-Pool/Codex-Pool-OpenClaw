# Codex-Pool OpenClaw 官方 Provider 全量对齐设计文档

**日期：** 2026-03-09

## 目标

把 `Codex-Pool-OpenClaw` 的 `cp` 兼容层从“能连上、能出字、部分兼容”提升到“除 `accountId` 认证假设外，与官方 `openai-codex-responses` provider 行为尽量一致”。

这次不是继续零敲碎打补单点缺口，而是把官方 provider 的核心行为整体拉平，包括：

1. request/message 构造
2. tool / reasoning / refusal / usage 语义
3. HTTP 错误解析与 retry/backoff
4. SSE 事件归一化
5. headers 细节
6. `streamSimple` 行为
7. 可选 websocket transport

唯一保留的定制点是：

- 允许直接使用 `cp_...` key
- 不强依赖从 token 中解出 `chatgpt_account_id`
- 仅在显式提供 `chatgptAccountId` 时才附带该 header

## 根因

前几轮问题已经证明，当前插件的真正风险不是某一条缺失字段，而是**我们自己手写了一套最小 provider 适配层**。

一旦我们不再复用官方实现，就必须自己维护：

- message 转换语义
- thinking/toolcall/text 流事件语义
- usage/stopReason 归一化
- retry 与错误友好化
- header 构造细节

结果就是每修完一层，又会从另一层继续冒出差异，例如：

- `Failed to extract accountId from token`
- `Unsupported message role: assistant`
- 工具定义丢失
- tool call 不触发
- `thinkingSignature` / `toolcall_end` / `usage` 不一致

所以这次的根因修复方向不是“继续补点”，而是**把官方 provider 主体整体镜像下来，只保留 auth 定制差异**。

## 方案对比

### 方案 A：继续按差异清单逐项手补

**优点**

- 单次改动看起来小
- 不需要重组文件结构

**缺点**

- 每次都要重新审官方代码
- 很容易漏掉行为耦合项
- 长期维护成本最高

### 方案 B：复用/镜像官方共享逻辑，只替换 auth 假设（推荐）

**优点**

- 最接近“和官方一模一样”
- 未来升级时只需要重新比对少量定制点
- 能系统性消灭 request/stream/message 漂移

**缺点**

- 本次改动面较大
- 需要补一组更完整的回归测试

### 方案 C：尝试直接包裹官方 provider 并 monkey-patch 内部函数

**优点**

- 表面上代码最少

**缺点**

- 官方内部函数未导出，运行时 patch 非常脆弱
- 一旦上游构建产物或私有符号变化，插件会直接失效

## 推荐方案

采用 **方案 B**：

1. 在本仓库中镜像官方 `openai-codex-responses` / `openai-responses-shared` 的关键行为。
2. 只在认证相关位置做最小定制：
   - 不解析 `cp_...` 的 JWT `accountId`
   - `Authorization` 直接透传 `cp_...`
   - `chatgpt-account-id` 改为可选
3. 其余行为全部向官方当前版本对齐。

## 设计细节

### 1. Request / Message 对齐

`src/provider/request.js` 不再手写最小消息转换，而是对齐官方共享逻辑：

- 使用与官方一致的消息变换语义
- 支持：
  - `assistant` `thinkingSignature`
  - `toolCall` id 规范化
  - orphaned tool call 补 synthetic `toolResult`
  - cross-model / cross-provider 消息兼容
  - `sanitizeSurrogates`
- tools 结构使用和官方一致的 `convertResponsesTools(..., { strict: null })`

### 2. Stream 对齐

`src/provider/stream.js` 对齐官方主流程：

- `streamSimple` 与 `stream` 分离
- 采用官方的：
  - retry/backoff
  - `parseErrorResponse`
  - `mapCodexEvents`
  - `parseSSE`
  - `processResponsesStream`
- 保留 Codex-Pool 自定义 URL 解析与 auth header 构造
- 支持官方 websocket transport，并在不支持或失败时回退 SSE

### 3. Auth 对齐

`src/provider/auth.js` 对齐官方 header 构造顺序：

1. 从 `model.headers` 起始
2. 写入 `Authorization`
3. 可选写入 `chatgpt-account-id`
4. 对齐官方：
   - `OpenAI-Beta`
   - `originator`
   - `User-Agent`
   - `accept`
   - `content-type`
5. 叠加 runtime `headers`
6. 最后补 `session_id`

其中唯一与官方不同的是：

- 官方强制 `chatgpt-account-id`
- 我们改成“有值才带”

### 4. Provider 对齐

`src/plugin/register.js` 里的 `codexProvider` 需要从“`streamSimple` 直接复用 `stream`”改为“显式暴露与官方同构的 `stream` / `streamSimple`”。

这样 OpenClaw 调用 `streamSimple` 时，行为才能与官方一致。

### 5. 测试策略

先补红灯，再实现。测试覆盖至少包含：

#### Request 层

1. `thinkingSignature` 会回放成 reasoning item
2. cross-model assistant 消息会按官方降级
3. tool call id 会按官方规则规范化
4. orphaned tool call 会补 synthetic tool result
5. 非法 surrogate 会被清洗

#### Auth 层

1. header 顺序与覆盖行为对齐
2. `User-Agent` / `originator` / `OpenAI-Beta` 对齐
3. `chatgpt-account-id` 仍保持可选

#### Stream 层

1. `response.done` 映射为 `response.completed`
2. `response.output_item.done` 产出 `thinking_end` / `text_end` / `toolcall_end`
3. `response.refusal.delta` 被正确映射
4. `response.completed` 会写 `usage` 与 `stopReason`
5. `toolCall` 存在时 `stopReason=toolUse`
6. 429 / 503 会触发 retry
7. 坏 JSON SSE chunk 不会炸掉整条流

## 非目标

这次不做与官方无关的扩展：

1. 不增加 Codex-Pool 私有增强字段
2. 不改 OpenClaw 插件注册流程
3. 不改现有 provider id / auth 向导表单结构

## 成功标准

满足以下条件即视为完成：

1. request / auth / stream 三层行为都以官方 provider 为基线
2. 当前已知差异项全部有测试覆盖
3. 新测试先失败、后通过
4. 全量测试通过
5. 重启 gateway 后，`cp` provider 至少在日志层具备：
   - 工具调用
   - 正确 `toolUse` stopReason
   - reasoning / refusal / usage 基本对齐
