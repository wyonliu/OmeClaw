# CaptainCast 快速创建指令

## 给 AI 的指令

```
请基于 OmeClaw (https://github.com/wyonliu/OmeClaw) 的架构，创建一个名为 CaptainCast 的项目。

项目概述：
- 名称：CaptainCast - 船长与麦洛的超时空电台
- 类型：多人互动 AI 电台系统
- 技术栈：Node.js + TypeScript + WebSocket

核心功能：
1. 用户注册/登录系统
2. 创建 AI 主播（4种模板：船长型、麦洛型、学者型、诗人型）
3. 录制和发布电台节目
4. 电台广场（发现、推荐、搜索）
5. 社交互动（关注、点赞、评论、连麦）
6. 游戏化系统（XP、等级、成就）
7. 实时通知（WebSocket）

主播模板示例：

船长型：
- 性格：稳重、幽默、睿智
- 风格：娓娓道来，用航海比喻
- 开场：欢迎登船，今天我们要航向哪里？
- 称呼：水手们

麦洛型：
- 性格：活泼、好奇、爱提问
- 风格：轻快互动，充满好奇心
- 开场：嘿！今天有什么新鲜事？
- 称呼：朋友们

项目结构：
captaincast/
├── src/
│   ├── server.ts          # 主服务器
│   ├── user.ts            # 用户系统
│   ├── host.ts            # 主播创建
│   ├── radio.ts           # 电台系统
│   ├── plaza.ts           # 电台广场
│   ├── interaction.ts     # 互动系统
│   ├── gamification.ts    # 游戏化
│   ├── websocket.ts       # 实时通信
│   └── agent.ts           # AI 核心
├── web/
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── css/
│       ├── auth.css
│       └── host-creation.css
└── .captaincast/          # 数据目录

设计风格：
- 主题：复古收音机风格
- 颜色：深蓝(#1a2332) + 金色(#d4af37) + 亮蓝(#4a90e2)
- 元素：旋钮、刻度盘、信号波动动画

关键 API：
- POST /api/auth/register - 注册
- POST /api/auth/login - 登录
- GET /api/host/templates - 获取主播模板
- POST /api/host/create - 创建主播
- POST /api/radio/create - 创建节目
- GET /api/plaza/feed - 获取推荐 Feed
- POST /api/interaction/follow - 关注
- GET /api/gamification/progress - 获取进度

游戏化系统：
- 发布节目 +50 XP
- 获得点赞 +5 XP
- 获得评论 +10 XP
- 8个等级：新手主播 → 超时空之声
- 15个成就：首秀、百人迷、话痨、连麦达人等

请完整实现所有功能，包括：
1. 完整的后端 API
2. 前端用户界面
3. AI 主播对话系统
4. 节目生成功能
5. 实时通知系统
6. 数据持久化
7. Docker 部署支持
8. 完整文档（README、API、GUIDE）

参考 OmeClaw 的代码结构和实现方式，但要针对电台场景进行定制。

开始创建项目！
```

## 详细文档

完整的技术规格和实现细节请参考：`CAPTAINCAST_PROMPT.md`

## 验收标准

创建完成后，项目应该能够：
- ✅ 用户注册并创建主播
- ✅ 录制和发布节目
- ✅ 在广场发现其他节目
- ✅ 互动（关注、点赞、评论）
- ✅ 游戏化系统正常工作
- ✅ 实时通知推送
- ✅ 多用户同时使用
- ✅ Docker 一键部署

## 测试命令

```bash
# 克隆并启动
git clone <repo>
cd captaincast
npm install
npm run build
npm start

# 访问
http://localhost:3000
```

---

**将此指令发给另一个 AI，它会基于 OmeClaw 创建完整的 CaptainCast 项目！** 🎙️
