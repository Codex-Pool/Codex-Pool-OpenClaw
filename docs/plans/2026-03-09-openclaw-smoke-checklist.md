# Codex-Pool OpenClaw Smoke Checklist

## 目标

确认 `OpenClaw` 通过官方插件安装/启用 + provider auth 流程调用 `Codex-Pool` 时：

1. 不再本地报 `Failed to extract accountId from token`
2. 请求能实际到达 `Codex-Pool`
3. 若后端异常，OpenClaw 看到的是后端真实错误

## 步骤

1. 备份 `~/.openclaw/agents/main/agent/models.json`
2. 安装并启用插件：

   ```bash
   openclaw plugins install --link /Users/wangnov/Codex-Pool-OpenClaw
   openclaw plugins enable codex-pool-openclaw
   ```

3. 运行 provider auth：

   ```bash
   openclaw models auth login --provider codex-pool --set-default
   ```

4. 在向导中填写：
   - `Codex-Pool base URL`
   - `cp_...` API key
   - 模型列表
5. 重启 Gateway
6. 发送最小消息：`ping`

## 通过标准

- OpenClaw 侧不再出现 `Failed to extract accountId from token`
- `Codex-Pool` 日志能看到对应请求
- 若号池失败，返回的是上游/代理真实错误，不是本地 JWT 解析错误

## 若失败，优先看哪里

1. `openclaw plugins list` 里是否能看到 `codex-pool-openclaw`
2. `openclaw plugins enable codex-pool-openclaw` 是否已生效
3. `openclaw models status --json` 中 `codex-pool` provider 是否存在
4. `baseUrl` 是否填成了 `http://127.0.0.1:8091`
5. `Codex-Pool` 是否仍在返回账号池层面的真实错误
