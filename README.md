<p align="center">
  <img src="https://img.shields.io/badge/OmeClaw-v0.5.0-8b5cf6?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/TypeScript-~1500_lines-3178c6?style=for-the-badge" alt="Size">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

<h1 align="center">🪼 OmeClaw</h1>

<p align="center">
  <strong>养一只属于你的数字分身</strong>
</p>

<p align="center">
  越聊越懂你 · 11层人本记忆 · 羁绊养成 · 多端同步 · 开源可控
</p>

---

## ✨ 功能亮点

| | OmeClaw |
|---|---|
| **养成式分身** | 给它起名字、定称呼和关系，它就是你定义的角色——伴侣、影子、搭子、宠物 |
| **11层人本记忆** | 基因/人格/性格/爱好/技能/表现/关系/经历/目标/情感/玄学，持续从对话中自动提取 |
| **记忆沉淀** | L0 短期碎片 → L1 中期模式 → L2 核心认知，高频记忆自动升级为人格理解 |
| **零AI腔** | 不说"您"、不分段列点、像微信聊天一样自然，称呼和关系无条件遵从用户定义 |
| **游戏化养成** | 五阶亲密度、XP经验值、连击系统、成就解锁、记忆写入特效 |
| **跨端同步** | SQLite 持久化、飞书/Web/CLI 共享同一份记忆和身份 |
| **多智能体** | 主分身编排、对话中创建子Agent并委派任务、定时提醒 |
| **自进化心跳** | Agent 定期自我反思，从记忆中提炼洞察，持续迭代人格理解 |
| **PWA 移动端** | 支持添加到主屏幕，移动端体验接近原生 App |
| **60秒初体验** | 引导式人格测试，30秒建立初始画像 |
| **轻量开源** | ~1500行 TypeScript，MIT协议，零Docker |

---

## 🚀 快速开始

```bash
# 安装
npm install -g omeclaw

# 创建项目
omeclaw create my-agents

# 启动
cd my-agents
omeclaw start
# 仪表盘: http://localhost:8080
```

---

## 🧠 记忆系统

OmeClaw 的核心是**人本模型**——不是关键词匹配，而是对人的深层理解。

### 11层维度

| 层 | 采集内容 | 示例 |
|---|---|---|
| 🧬 基因层 | 生日/属相/星座/血型/八字 | "86年七夕生日" → 自动存储 |
| 🎭 人格层 | MBTI/九型/大五/信条 | "INTJ" → 存入 + 惊喜回应 |
| 🧠 性格层 | 内外向/理性感性/沟通风格 | 从对话风格自动推断 |
| ❤️ 爱好层 | 食物/音乐/运动/讨厌的事 | "爱吃火锅" → 记住 |
| ⚡ 技能层 | 擅长的事/专业/工作 | "做产品经理" → 记住 |
| 💬 表现层 | 口头禅/作息/表达风格 | 深夜发消息 → 推断夜猫子 |
| 👥 关系层 | 家人/伴侣/朋友 | "我女朋友..." → 记住 |
| 📌 经历层 | 纪念日/成就/转折点 | "去年跳槽" → 记住 |
| 🎯 目标层 | 计划/梦想/焦虑 | "最近在准备..." → 记住 |
| 💭 情感层 | 心情/压力/近期状态 | "好累啊" → 推断疲惫 |
| 🔮 玄学层 | 命理/五行/运势 | 对方感兴趣才存 |

### 记忆沉淀

- **L0 碎片**：每次对话中直接提取的原始信息
- **L1 模式**：高频出现的主题自动归纳为行为模式
- **L2 核心认知**：稳定的人格特征沉淀为长期理解

### 隐性提取

不只是记住你说的，更记住你"没说的"：
- "加班到12点" → 推断作息习惯
- "唉" → 推断近期情绪
- 深夜发消息 → 推断夜猫子倾向
- 发长消息 → 推断详细表达偏好
- 多次提到某人 → 推断重要关系

---

## 🎮 养成系统

| 阶段 | 记忆量 | XP | 表现 |
|---|---|---|---|
| 🫧 初见 | 0 | 0 | 好奇、主动了解你 |
| 🪼 认识中 | 1–4 | 50 | 开始有针对性回应 |
| 💙 熟悉了 | 5–14 | 150 | 自然提起之前的话题 |
| 💎 老朋友 | 15–29 | 400 | 像认识多年的朋友 |
| 🌊 灵魂伴侣 | 30+ | 900 | 比你自己还了解你 |

**成就系统**：初次记忆 🌱 / 初识 🪼 / 渐熟 💙 / 知己 💎 / 灵魂伴侣 🌊 / 三日连击 🔥 / 周连击 ⚡ / 月连击 👑

**记忆写入**时会有游戏化特效通知，让你感受到"它真的记住了"。

---

## 📁 架构

```
src/
├── config.ts        # 配置加载、Zod 校验
├── llm.ts           # OpenAI 兼容客户端
├── agent.ts         # Agent 编排、记忆提取、工具执行、自进化心跳
├── memory.ts        # SQLite 持久化、摘要压缩、11层人本模型
├── bus.ts           # Agent 间消息总线
├── tools.ts         # web_search/web_fetch/文件/Shell
├── scheduler.ts     # Cron 定时任务
├── server.ts        # HTTP API + Web UI
├── cli.ts           # create / start / chat
└── gateway/
    ├── base.ts      # Gateway 适配器
    ├── lark.ts      # 飞书（WebSocket 长连接）
    ├── telegram.ts
    └── discord.ts
```

---

## 🔧 核心能力

### 飞书集成

- **WebSocket 长连接**：无需 ngrok，本地即可接收消息
- **限流保护**：30次/分钟/用户，事件去重
- 所有消息跨端同步到统一记忆

### 内置工具

| 工具 | 说明 |
|---|---|
| `web_search` | Bing 搜索 |
| `web_fetch` | 抓取 URL 内容 |
| `read_file` / `write_file` | 文件读写 |
| `shell` | 执行命令 |
| `remember_about_user` | 持久记忆（自动 + 手动） |
| `set_reminder` | 定时提醒 |
| `create_agent` | 对话中创建子 Agent |
| `delegate_to_agent` | 委派任务给子 Agent |

---

## 📡 API

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/status` | GET | 系统状态 |
| `/api/agents` | GET/POST | 列出/创建 Agent |
| `/api/agents/state` | GET | Agent 实时运行状态 |
| `/api/agents/consistency` | GET | 配置一致性检查 |
| `/api/chat` | POST | 对话 |
| `/api/chat/poll?since=` | GET | 增量轮询新消息 |
| `/api/chat/history?merged=1` | GET | 聊天历史 |
| `/api/bond` | GET | 羁绊状态 |
| `/api/memory/model` | GET | 11层记忆结构 |
| `/api/memory/all` | GET | 全部记忆 |
| `/api/evolution` | GET | 自进化记录 |
| `/api/reminders` | GET | 定时提醒列表 |

---

## 📋 最佳实践

1. **开箱即用**：首次打开有引导式人格测试，30秒建立初始画像
2. **自然聊天**：不需要刻意"录入信息"，正常聊天中自动提取一切
3. **跨端无缝**：飞书/Web/CLI 随时切换，记忆和身份始终同步
4. **对话创建 Agent**：说"创建一个Agent叫Seer，最伟大的作家"即可
5. **定时提醒**：说"下午3点提醒我开会"就行

---

## 🔒 安全

- 敏感信息通过 `${ENV_VAR}` 引用
- 飞书限流保护
- 路径遍历防护
- SQLite WAL 模式

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
