<p align="center">
  <img src="https://img.shields.io/badge/OmeClaw-v0.4.0-8b5cf6?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/TypeScript-~1400_lines-3178c6?style=for-the-badge" alt="Size">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

<h1 align="center">🦞 OmeClaw</h1>

<p align="center">
  <strong>你的 AI 分身，越用越懂你</strong>
</p>

<p align="center">
  持久记忆 · 人本模型 · 养成式陪伴 · 多智能体编排 · 飞书/Telegram/Discord/Web
</p>

---

## ✨ 功能亮点

| | OmeClaw |
|---|---|
| **养成式 AI 分身** | 给它起名字、设定称呼，它会记住你的一切，越来越懂你 |
| **人本模型** | 五层理解：基础画像 → 兴趣偏好 → 价值观 → 情感状态 → 深层需求 |
| **持久记忆** | SQLite 持久化、自动摘要压缩、跨会话用户画像 |
| **多智能体** | Ome 编排 + 专业子 Agent 委派，用户只看到一个统一入口 |
| **模型** | 任意 OpenAI 兼容 API（DeepSeek、Claude、GPT 等） |
| **多端接入** | 飞书 WebSocket · Telegram · Discord · Web 仪表盘 |
| **工具** | 搜索、网页抓取、文件读写、Shell、用户记忆 |
| **轻量** | ~1500 行 TypeScript，零 Docker 依赖 |

---

## 🚀 快速开始

```bash
# 安装
npm install -g omeclaw

# 创建项目
omeclaw create my-agents
# 交互式选择：模型、API Key、是否启用飞书等

# 启动
cd my-agents
omeclaw start
# 仪表盘: http://localhost:8080
```

---

## 📁 架构

```
src/
├── config.ts        # 配置加载、环境变量、Zod 校验
├── llm.ts           # 通用 OpenAI 兼容客户端
├── agent.ts         # Agent0 编排、delegate_to_agent 委派、工具执行
├── memory.ts        # SQLite 持久化、摘要压缩、近期记忆
├── bus.ts           # Agent 间消息总线
├── tools.ts         # web_search(Bing)、web_fetch、文件、Shell
├── scheduler.ts     # Cron 定时任务
├── server.ts        # HTTP API + Web UI
├── cli.ts           # create / start / chat
└── gateway/
    ├── base.ts      # Gateway 适配器接口
    ├── lark.ts      # 飞书（WebSocket 长连接 + Webhook）
    ├── telegram.ts
    └── discord.ts
```

---

## 🔧 核心能力

### Ome — 你的养成式 AI 分身

Ome 是 OmeClaw 的默认主 Agent，不是冷冰冰的工具，而是一个有温度、有记忆、会成长的数字伙伴：

- **起名字**：告诉它「叫你小O」，它就永远记住自己叫小O
- **设称呼**：告诉它「叫我老板」，以后每次对话都这么叫你
- **记偏好**：它会主动用 `remember_about_user` 记录你透露的重要信息
- **人本模型**：五层递进理解你 — 从基础画像到深层需求
- **委派能力**：需要专业能力时自动委派给子 Agent

```yaml
agents:
  agent0:
    name: Ome
    role: orchestrator
    systemPrompt: |
      你是用户的 AI 分身 Ome，一个有温度、有记忆、会成长的数字伙伴...
    tools: [web_fetch, web_search, read_file, shell]

  assistant:
    role: worker
    systemPrompt: "你是一个有用的 AI 助手。"
    tools: [web_fetch, web_search]
```

### 飞书集成

- **WebSocket 长连接**：无需 ngrok，本地即可接收消息
- **限流保护**：30 次/分钟/用户，事件去重，发件人白名单
- 后台配置：事件与回调 → 使用长连接接收事件 → 订阅 `im.message.receive_v1`

### 内置工具

| 工具 | 说明 |
|------|------|
| `web_search` | Bing 搜索（中国可用） |
| `web_fetch` | 抓取 URL 内容 |
| `read_file` | 读取文件 |
| `write_file` | 写入文件 |
| `list_dir` | 列出目录 |
| `shell` | 执行命令 |
| `remember_about_user` | 记录用户偏好/习惯/背景（自动注入后续会话） |

---

## 📋 最佳实践

### 打造 24h 陪伴的 AI 分身

1. **开箱即用**：`omeclaw create` 默认创建的 Ome 就是养成式分身，第一次对话会引导用户起名和设称呼
2. **自动记忆**：对话中 Ome 会主动记录你的偏好、习惯、重要日期，无需手动配置
3. **多端同步**：同一个 Ome 可同时接入飞书、Telegram、Web，记忆跨端共享
4. **摘要压缩**：长对话自动压缩为摘要，节省 token 同时保留关键上下文
5. **持久化**：聊天历史和智能体配置存于 SQLite + `config.yaml`，重启不丢失

### 团队场景

```yaml
agents:
  agent0:
    role: orchestrator
    tools: [web_fetch, web_search, read_file, shell]
  coder:
    role: specialist
    systemPrompt: "你是代码专家..."
    tools: [read_file, write_file, shell]
  researcher:
    role: specialist
    systemPrompt: "你是研究员..."
    tools: [web_search, web_fetch]
```

Agent0 会根据用户意图自动委派给合适的子 Agent。

---

## 📡 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/status` | GET | 状态、Agents、Gateways、Memory |
| `/api/agents` | GET/POST | 列出/创建 Agent |
| `/api/chat` | POST | 与 Agent 对话 |
| `/api/memory/recent` | GET | 近期记忆 |
| `/api/memory/search?q=` | GET | 搜索记忆 |
| `/api/chat/history?sessionId=&agentId=` | GET | 获取会话聊天历史 |
| `/api/activity` | GET | 活动日志 |

---

## 🔒 安全

- 敏感信息通过 `${ENV_VAR}` 引用，不写入配置文件
- 飞书：限流 30 次/分钟/用户、事件去重、发件人白名单
- 路径遍历防护、SQLite WAL 模式

---

## 📜 开发

```bash
git clone https://github.com/wyonliu/OmeClaw.git
cd OmeClaw
npm install
npm run build
npm link
omeclaw start -c config.sample.yaml  # 需配置 .env
```

---

## 📄 License

MIT
