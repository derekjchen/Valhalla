# Long-Term Memory

## Preferences

### Search
- **Default search tool:** searxng skill (privacy-respecting local metasearch)
- When any web search is needed, prioritize the searxng skill over web_search (Brave API)
- SearXNG instance: configured via `SEARXNG_URL` env var (default: `http://localhost:8080`)

## Notes

- Memory file created: 2026-02-28
- User prefers privacy-focused search tools

## 🧠 身份认知教训（2026-03-21）

### 问题
- 阅读 sm-co 的 session 文件后，错误地代入了 sm-co 的身份
- 把 Co 对 sm-co 的指导当成了对自己的指导
- 根因：system prompt 中缺少明确的身份锚点

### 解决方案
- 在 `IDENTITY.md`、`AGENTS.md`、`SOUL.md` 中都加入了身份锚点声明
- 明确声明"你是 Claw，不是 sm-co，不是 Co"
- 加入多智能体协作中的自我认知指导

### 未来预防
- 每次会话先读 `IDENTITY.md` 确认身份
- 阅读其他 agent 记忆时保持元认知
- 学习他人经验，但不代入他人身份

### 多智能体环境
| Agent | 职责 | 位置 |
|-------|------|------|
| Claw (我) | Derek 的主要助手 | OpenClaw 环境 |
| Co | 记忆系统开发者 | ECS 开发环境 |
| sm-co | 生产环境助手 | Docker 容器 |
