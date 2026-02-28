<p align="center">
  <img src="https://img.shields.io/badge/OmeClaw-v0.4.0-8b5cf6?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/TypeScript-~1400_lines-3178c6?style=for-the-badge" alt="Size">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

<h1 align="center">🐾 OmeClaw</h1>

<p align="center">
  <strong>Agent Operating System</strong> — 多智能体编排 · 任意模型 · 无限记忆 · 可插拔网关
</p>

<p align="center">
  一键创建你的 AI 分身，支持飞书/Telegram/Discord，无需 Docker
</p>

---

## ✨ 特点

| | OmeClaw |
|---|---|
| **多智能体** | Agent0 编排 + 专业子 Agent 委派 |
| **模型** | 任意 OpenAI 兼容 API（DeepSeek、Claude、GPT 等） |
| **网关** | 飞书 · Telegram · Discord · Web 仪表盘 |
| **记忆** | SQLite 持久化，自动压缩摘要 |
| **工具** | 网络搜索、网页抓取、文件读写、Shell |
| **中国友好** | 飞书 WebSocket 长连接，Bing 搜索，DeepSeek |
| **轻量** | ~1400 行 TypeScript，零 Docker 依赖 |

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

### Agent0 委派

Agent0 通过 **`delegate_to_agent` 工具**将任务委派给子 Agent，用户只看到最终整合回答：

```yaml
agents:
  agent0:
    role: orchestrator
    systemPrompt: "你是用户的 AI 分身。直接回答或委派给专业 Agent。"
    tools: [web_fetch, web_search, read_file, shell]  # 自动获得 delegate_to_agent

  assistant:
    role: worker
    systemPrompt: "你是通用助手。"
    tools: [web_fetch, web_search]
```

### 飞书集成

- **WebSocket 长连接**：无需 ngrok，本地即可接收消息
- **即时反馈**：收到消息后立即发送「🤔 正在思考...」
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

---

## 📡 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/status` | GET | 状态、Agents、Gateways、Memory |
| `/api/agents` | GET/POST | 列出/创建 Agent |
| `/api/chat` | POST | 与 Agent 对话 |
| `/api/memory/recent` | GET | 近期记忆 |
| `/api/memory/search?q=` | GET | 搜索记忆 |
| `/api/activity` | GET | 活动日志 |

---

## 🔒 安全

- 敏感信息通过 `${ENV_VAR}` 引用，不写入配置文件
- 飞书：限流 30 次/分钟/用户、事件去重、发件人白名单
- 路径遍历防护、SQLite WAL 模式

---

## 📜 开发

```bash
git clone https://github.com/wyonliu/omeclaw.git
cd omeclaw
npm install
npm run build
npm link
omeclaw start -c config.sample.yaml  # 需配置 .env
```

---

## 📄 License

MIT
