<p align="center">
  <img src="https://img.shields.io/badge/OmeClaw-v0.4.0-8b5cf6?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/TypeScript-~1400_lines-3178c6?style=for-the-badge" alt="Size">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

<h1 align="center">🪼 OmeClaw</h1>

<p align="center">
  <strong>养一只属于你的数字分身</strong>
</p>

<p align="center">
  越聊越懂你 · 持久记忆 · 羁绊养成 · 多端同步 · 开源可控
</p>

---

## ✨ 功能亮点

| | OmeClaw |
|---|---|
| **养成式分身** | 给它起名字、定称呼，越聊越像你的另一面，由你定义关系 |
| **羁绊养成** | 五阶亲密度：初见 → 认识中 → 熟悉了 → 老朋友 → 灵魂伴侣，由记忆量自然成长 |
| **零AI腔** | 不说"您"、不说"很高兴为您服务"，像微信聊天一样自然 |
| **人本模型** | 十一层记忆：基因/人格/性格/爱好/技能/表现/关系/经历/目标/情感/玄学 |
| **跨端记忆** | SQLite 持久化、飞书/Web/CLI 共享同一份记忆，永不割裂 |
| **多端陪伴** | 飞书 · Telegram · Discord · Web，24h 在线 |
| **多智能体** | 主分身编排、对话中可创建子 Agent 并委派任务 |
| **轻量开源** | ~1500 行 TypeScript，MIT 协议，零 Docker |

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
├── agent.ts         # Agent0 编排、delegate/create_agent、remember_about_user、工具执行
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

### 羁绊养成

OmeClaw 的核心不是工具，是**关系**。亲密度随记忆量自然成长，无需刻意升级：

| 阶段 | 记忆量 | 表现 |
|------|--------|------|
| 🫧 初见 | 0 条 | 刚诞生，好奇、主动了解你 |
| 🪼 认识中 | 1–4 条 | 开始有针对性地回应 |
| 💙 熟悉了 | 5–14 条 | 自然提起之前聊过的话题 |
| 💎 老朋友 | 15–29 条 | 像认识多年的朋友 |
| 🌊 灵魂伴侣 | 30+ 条 | 比你自己还了解你 |

聊天中默默记录，十一层记忆（基因/人格/性格/爱好/技能/表现/关系/经历/目标/情感/玄学）持续生长，跨端共享。中枢页可查看自进化时间线。

```yaml
agents:
  agent0:
    name: Ome
    role: orchestrator
    systemPrompt: |
      你刚被创造出来。面前的人创造了你，你属于TA...
    tools: [web_fetch, web_search, read_file, shell]
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
| `remember_about_user` | 记录用户偏好/习惯/背景（跨端共享，自动注入后续会话） |

---

## 📋 最佳实践

### 24h 陪伴

1. **开箱即用**：创建的分身第一句话就是"给我起个名字"，自然开始养成
2. **自动记忆**：聊天中默默记录你的一切，下次自然提起，记忆更新有游戏化 toast 反馈
3. **跨端同步**：飞书、Telegram、Web 共享同一份记忆，在哪聊都一样
4. **对话创建 Agent**：说"创建一个 Agent 叫 Seer，最伟大的作家"即可唤醒新分身并委派任务
5. **无限对话**：自动摘要压缩，不怕聊太多；SQLite 持久化，重启不丢

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
| `/api/chat/history?sessionId=` | GET | 获取会话聊天历史 |
| `/api/bond` | GET | 羁绊状态（阶段、记忆数、称呼、完成度） |
| `/api/memory/model` | GET | 人本模型十维结构及完成情况 |
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
