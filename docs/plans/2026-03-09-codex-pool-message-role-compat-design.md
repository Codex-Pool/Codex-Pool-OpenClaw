# Codex-Pool OpenClaw 消息角色兼容设计文档

**日期：** 2026-03-09

## 目标

修复 `Codex-Pool-OpenClaw` 在把 OpenClaw 会话历史转换为 Codex-Pool 请求体时，只支持 `user` 文本消息、遇到 `assistant` 历史就直接抛错的问题。

本次目标是让插件在保留 Codex 请求体 / SSE 语义的前提下，兼容 OpenClaw 真实会话里常见的历史消息角色与块类型，至少覆盖：

1. `user`
2. `assistant`
3. `toolResult`

## 根因

当前实现中，`src/provider/request.js` 的 `toInputMessage()` 仅接受 `role === "user"`，并且只接受纯字符串内容。

这与 OpenClaw / pi-ai 的真实消息模型不一致。OpenClaw 在历史中会保留：

- `assistant` 文本块
- `assistant` thinking / toolCall 块
- `toolResult` 文本或图片块

因此，当飞书会话里已经存在上一轮助手回复时，插件在构建下一次请求时就会报：

- `Unsupported message role: assistant`

## 方案对比

### 方案 A：简单丢弃非 `user` 历史

**优点**

- 实现最快
- 风险最小

**缺点**

- 丢上下文最严重
- 工具调用链会断
- 不符合这次“保真兼容”的选择

### 方案 B：对齐 pi-ai Responses 消息转换（推荐）

**优点**

- 与 OpenClaw / pi-ai 的既有语义最一致
- 能保留 `assistant`、`toolResult` 的上下文
- 后续继续补图片 / toolCall 时可沿同一路径扩展

**缺点**

- 需要补若干消息块映射规则
- 测试要覆盖更多分支

### 方案 C：直接复用上游 `convertResponsesMessages`

**优点**

- 理论上最一致

**缺点**

- 当前插件仓没有直接依赖那套内部 helper 的稳定 API
- 引入更多运行时耦合，维护成本更高
- 对当前仓库“最小、可控适配层”的边界不友好

## 推荐方案

采用 **方案 B**：在本仓库中实现一个最小但语义对齐的消息转换层，规则尽量向 `pi-ai/dist/providers/openai-responses-shared.js` 靠拢。

## 转换规则

### 1. `user`

- 纯字符串内容 → `role: "user"` + `input_text`
- 数组内容中的 `text` → `input_text`
- 数组内容中的图片块 → `input_image`
- 若模型不支持图片，则过滤图片块

### 2. `assistant`

将单条 `assistant` 消息展开为一个或多个 Codex/Responses 输入项：

- `text` 块 → `type: "message"`，`role: "assistant"`，内容为 `output_text`
- `thinking` 块：
  - 若有 `thinkingSignature`，尝试解析为 reasoning item 并写入
  - 若无签名，不主动伪造 reasoning item
- `toolCall` 块 → `type: "function_call"`

### 3. `toolResult`

- 文本结果 → `type: "function_call_output"`
- 图片结果：
  - 仍保留 `function_call_output`
  - 若模型支持图片，再追加一个 `role: "user"` 的 follow-up 输入，附带图片

## 边界与非目标

本次不做：

1. 不改流式解析层
2. 不改 provider 注册/配置层
3. 不额外扩展新的 OpenClaw provider 功能
4. 不处理与本次报错无关的 tmux watch warning

## 测试策略

### 单元测试

优先在 `tests/provider-request.test.js` 增补：

1. `assistant` 文本历史不会再抛错
2. `assistant` 的 `text + toolCall` 会被拆成 Codex 兼容输入项
3. `toolResult` 文本会转成 `function_call_output`
4. `toolResult` 图片在支持图片的模型下会附带 follow-up `user` 输入

### 回归测试

跑：

- `npm test -- tests/provider-request.test.js`
- `npm test`

若通过，再让用户重启/复测 OpenClaw。

## 成功标准

满足以下条件即视为完成：

1. `buildCodexPoolRequestBody()` 不再因 `assistant` 历史抛 `Unsupported message role`
2. `assistant` / `toolResult` 至少能按最小保真规则转换
3. 全量测试保持通过
4. 用户再次向飞书发消息时，不再卡在这个角色错误上
