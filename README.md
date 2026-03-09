# Codex-Pool OpenClaw

面向 `OpenClaw` 的 `Codex-Pool` 自定义 provider/plugin。

当前目标：

- 保留 Codex 风格请求体与 SSE 语义
- 允许直接使用 `cp_...` key
- 避免内置 `openai-codex-responses` 对 JWT `accountId` 的硬依赖
