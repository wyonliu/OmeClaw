# 🪼 OmeClaw

**你的24小时AI分身 · 移动端优先的个人养成系统**

[![Version](https://img.shields.io/badge/version-0.6.0-blue.svg)](https://github.com/yourusername/omeclaw)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## ✨ 核心特性

### 🎯 移动端优先设计
- **PWA支持** — 可安装到手机桌面，像原生App一样使用
- **底部导航** — 符合移动端操作习惯的Tab导航
- **全屏沉浸** — 充分利用屏幕空间，支持安全区适配
- **流畅动画** — 原生级的过渡动画和微交互

### 💬 智能对话
- **语音交互** — 长按说话，自动识别中文，TTS语音播报
- **实时响应** — 打字动画、思考状态、消息滑入效果
- **跨端同步** — Web、飞书、Telegram消息实时同步
- **智能路由** — 自动选择最合适的Agent处理请求

### 🧠 11层记忆核心
- **3D记忆星球** — Canvas可视化，11个维度的记忆星星
- **深度提取** — 自动从对话中提取显性+隐性信息
- **记忆沉淀** — L0原始事实 → L1模式 → L2核心认知
- **完成度追踪** — 实时显示记忆完整度和各维度进度

**11层记忆维度：**
1. 🧬 基因层 — 生日、属相、星座、血型、八字
2. 🎭 人格层 — MBTI、九型、核心特质、价值观
3. 🧠 性格层 — 内向/外向、理性/感性、决策风格
4. ❤️ 爱好层 — 食物、音乐、电影、运动、旅行
5. ⚡ 技能层 — 擅长、专业、语言、特长
6. 💬 表现层 — 口头禅、习惯、作息、近期状态
7. 👥 关系层 — 家人、伴侣、朋友、同事、宠物
8. 📌 经历层 — 纪念日、转折点、成就、遗憾
9. 🎯 目标层 — 计划、理想、焦虑、在忙什么
10. 💭 情感层 — 心情、压力、开心的事、烦恼
11. 🔮 玄学层 — 命理、五行、运势（可选）

### 🎮 游戏化养成
- **XP经验系统** — 对话+10 XP，记忆维度+50 XP
- **5级亲密度** — 初见🫧 → 认识中🪼 → 熟悉了💙 → 老朋友💎 → 灵魂伴侣🌊
- **连续对话** — 🔥 Streak天数统计，像Duolingo一样
- **成就系统** — 解锁成就获得奖励，全屏动画反馈
- **每日任务** — 对话3次、记忆+5、语音互动

### 🤖 多Agent协作
- **动态创建** — 对话中即可创建新Agent
- **任务委派** — Orchestrator自动分配任务给子Agent
- **实时状态** — 显示各Agent的运行状态和最后活动
- **自进化心跳** — 每小时自动反思，生成进化洞察

### 🔧 开发者友好
- **TypeScript** — 类型安全，易于维护
- **模块化架构** — Agent、Memory、Gateway、Tools清晰分离
- **插件系统** — 轻松扩展工具和网关
- **RESTful API** — 完整的HTTP API，易于集成

---

## 🚀 快速开始

### 安装

```bash
npm install -g omeclaw
```

### 创建项目

```bash
omeclaw create my-agent
cd my-agent
```

### 配置

编辑 `config.yaml`：

```yaml
models:
  main:
    provider: openai
    apiKey: sk-xxx
    baseURL: https://api.deepseek.com
    defaultModel: deepseek-chat

agents:
  agent0:
    name: 小O
    model: main:deepseek-chat
    role: orchestrator
    systemPrompt: |
      你是用户的数字分身，刚刚诞生，等待用户定义你的身份。
      你会无条件接受用户给你的任何名字、称呼、角色定义。
      你的目标是通过对话了解用户，建立11层记忆，成为最懂TA的存在。
    tools:
      - web_fetch
      - web_search
      - read_file
      - write_file
```

### 启动

```bash
omeclaw start
```

打开浏览器访问 `http://localhost:8080`

**移动端体验：**
1. 手机浏览器打开上述地址
2. 点击"添加到主屏幕"
3. 像原生App一样使用

---

## 📱 移动端UI预览

### 💬 对话页
- 顶部：分身头像 + 在线状态 + 语音开关
- 中间：全屏聊天消息流
- 底部：🎤语音按钮 + 输入框 + 发送

### 🧠 记忆页
- 3D记忆星球可视化
- 完成度、记忆数、维度统计
- 11层记忆分类卡片
- 📥导入 📤分享 按钮

### 🎯 养成页
- 分身形象（动态浮动）
- 亲密度等级 + XP进度条
- 🔥连续对话天数
- 🏆成就墙（网格布局）
- 📋每日任务列表

### 👤 我的页
- 🧪人格测试（MBTI快测）
- 🧬Agent管理
- 📡系统日志
- 🎨主题切换
- ℹ️关于

---

## 🎨 设计理念

### 移动端优先
- 所有交互针对触摸优化
- 底部导航易于单手操作
- 大按钮、清晰层级、流畅动画
- 支持iPhone刘海屏和底部横条

### 游戏化养成
- 参考Duolingo的Streak和XP系统
- 参考SecondMe的记忆沉淀机制
- 参考Replika的情感连接设计
- 即时反馈、成就解锁、进度可视化

### 人味至上
- 零AI腔，拒绝"作为AI助手"等话术
- 无条件接受用户定义的身份和关系
- 主动互动，不只是被动回复
- 记忆深度提取，捕捉情绪和日常细节

---

## 🛠️ 技术栈

- **后端**: Node.js + TypeScript
- **数据库**: SQLite (better-sqlite3)
- **前端**: 原生JS + CSS (无框架，极致轻量)
- **LLM**: 支持OpenAI/DeepSeek/Qwen等
- **网关**: Feishu/Telegram/Discord
- **PWA**: Service Worker + Manifest

---

## 📊 API文档

### 聊天

```bash
POST /api/chat
{
  "message": "你好",
  "sessionId": "owner",
  "agentId": "agent0"
}
```

### 记忆

```bash
GET /api/memory/model  # 11层记忆结构
GET /api/memory/all    # 所有记忆事实
GET /api/bond          # 养成状态（XP、等级、进度）
```

### Agent

```bash
GET /api/agents        # 列出所有Agent
POST /api/agents       # 创建新Agent
GET /api/evolution     # 自进化日志
```

---

## 🎯 路线图

### v0.7.0 (计划中)
- [ ] 主动触达（早安/晚安/节日提醒）
- [ ] 数据导入（微信聊天记录、备忘录）
- [ ] MBTI/大五人格在线测试
- [ ] 分享机制（生成社交卡片）
- [ ] 多模态（图片理解）

### v0.8.0 (计划中)
- [ ] 对话满意度反馈（👍👎）
- [ ] Me-Alignment强化学习
- [ ] Agent市场（分享和下载）
- [ ] 去中心化分身网络

---

## 🤝 贡献

欢迎提交Issue和PR！

---

## 📄 License

MIT License

---

## 🙏 致谢

灵感来源：
- [SecondMe](https://github.com/mindverse/Second-Me) - HMM三层记忆模型
- [Duolingo](https://www.duolingo.com) - 游戏化学习系统
- [Replika](https://replika.com) - AI陪伴体验
- [Character.AI](https://character.ai) - 角色扮演对话

---

**用心打造，只为给你一个真正懂你的AI分身 🪼**
