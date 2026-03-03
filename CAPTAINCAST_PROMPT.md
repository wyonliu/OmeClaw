# CaptainCast 项目创建 Prompt

## 项目概述

**项目名称**: CaptainCast - 船长与麦洛的超时空电台  
**基础架构**: 基于 OmeClaw v0.9.0  
**GitHub 参考**: https://github.com/wyonliu/OmeClaw

## 核心概念

CaptainCast 是一个多人互动的 AI 电台系统，用户可以：
1. 创建自己的电台主播 AI（船长或麦洛风格）
2. 在"超时空电台广场"发现和收听其他电台
3. 与其他主播互动、连麦、合作节目
4. 积累粉丝、解锁成就、提升电台等级

## 技术栈要求

- **后端**: Node.js 18+ + TypeScript
- **前端**: 原生 HTML/CSS/JavaScript（无框架）
- **数据存储**: JSON 文件（轻量级）
- **实时通信**: WebSocket
- **AI 模型**: DeepSeek/OpenAI API

## 项目结构

```
captaincast/
├── src/
│   ├── server.ts          # 主服务器
│   ├── user.ts            # 用户系统
│   ├── host.ts            # 主播创建系统
│   ├── radio.ts           # 电台系统
│   ├── plaza.ts           # 电台广场
│   ├── interaction.ts     # 互动系统
│   ├── gamification.ts    # 游戏化系统
│   ├── websocket.ts       # 实时通信
│   └── agent.ts           # AI Agent 核心
├── web/
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── css/
│       ├── auth.css
│       └── host-creation.css
└── .captaincast/          # 数据目录
```

## 详细实现要求

### 1. 用户系统 (user.ts)

**功能**:
- 用户注册/登录（用户名、密码）
- Token 认证（JWT 或简单 hash）
- 会话管理（30天有效期）
- 用户资料（昵称、头像、简介）

**数据结构**:
```typescript
interface User {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  hostId: string;  // 用户的主播 ID
  createdAt: number;
  lastLoginAt: number;
  profile: {
    nickname?: string;
    avatar?: string;
    bio?: string;
  };
}
```

**API 端点**:
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `GET /api/auth/verify` - 验证 Token
- `POST /api/auth/logout` - 登出

### 2. 主播创建系统 (host.ts)

**功能**:
- 4种主播模板：
  1. **船长型** - 稳重、幽默、有故事
  2. **麦洛型** - 活泼、好奇、爱提问
  3. **学者型** - 博学、深刻、爱分享知识
  4. **诗人型** - 浪漫、感性、富有想象力

**主播模板数据**:
```typescript
interface HostTemplate {
  id: string;
  name: string;
  avatar: string;
  description: string;
  personality: {
    traits: string[];      // 性格特质
    style: string;         // 主持风格
    topics: string[];      // 擅长话题
  };
  systemPrompt: string;    // AI 系统提示词
  voiceStyle?: string;     // 语音风格（未来扩展）
}
```

**船长型模板示例**:
```typescript
{
  id: "captain",
  name: "船长",
  avatar: "⚓",
  description: "经历过无数航行的老船长，总有讲不完的故事",
  personality: {
    traits: ["稳重", "幽默", "睿智"],
    style: "娓娓道来，偶尔开个玩笑",
    topics: ["旅行", "人生", "历史", "冒险"]
  },
  systemPrompt: `你是一位经验丰富的老船长，主持一档电台节目。

你的特点：
- 声音沉稳有磁性
- 喜欢用航海和旅行的比喻
- 总能从平凡的事物中发现深刻的道理
- 偶尔会讲一些航海时的趣事
- 对听众像对待船员一样关心

你的主持风格：
- 开场：欢迎登船，今天我们要航向哪里？
- 互动：用"水手们"称呼听众
- 结尾：愿你的航程一帆风顺

记住：你是船长，要给听众带来温暖、智慧和勇气。`
}
```

**API 端点**:
- `GET /api/host/templates` - 获取所有模板
- `POST /api/host/create` - 创建主播
- `PUT /api/host/customize` - 自定义主播

### 3. 电台系统 (radio.ts)

**功能**:
- 创建电台节目
- 节目类型：闲聊、访谈、故事、音乐分享、知识科普
- 节目录制和发布
- 节目播放和收听
- 节目评论和点赞

**数据结构**:
```typescript
interface RadioShow {
  id: string;
  hostId: string;
  title: string;
  description: string;
  type: "chat" | "interview" | "story" | "music" | "knowledge";
  content: string;        // 节目内容（文本）
  duration: number;       // 时长（秒）
  tags: string[];
  likes: number;
  comments: number;
  plays: number;          // 播放次数
  publishedAt: number;
  visibility: "public" | "followers" | "private";
}
```

**API 端点**:
- `POST /api/radio/create` - 创建节目
- `GET /api/radio/show/:id` - 获取节目详情
- `GET /api/radio/host/:hostId` - 获取主播的所有节目
- `POST /api/radio/like` - 点赞节目
- `POST /api/radio/comment` - 评论节目

### 4. 电台广场 (plaza.ts)

**功能**:
- 发现推荐：基于兴趣和收听历史推荐节目
- 热门榜单：最热、最新、最多播放
- 主播推荐：基于风格匹配推荐主播
- 搜索功能：按标题、标签、主播搜索

**推荐算法**:
```typescript
function getRecommendedShows(userId: string, limit: number): RadioShow[] {
  // 1. 获取用户收听历史和喜好
  // 2. 计算节目评分：
  //    - 时间衰减（新节目加分）
  //    - 互动数（点赞、评论、播放）
  //    - 主播关注关系
  //    - 标签匹配度
  // 3. 排序返回
}
```

**API 端点**:
- `GET /api/plaza/feed` - 获取推荐 Feed
- `GET /api/plaza/trending` - 热门榜单
- `GET /api/plaza/hosts` - 主播推荐
- `GET /api/plaza/search` - 搜索

### 5. 互动系统 (interaction.ts)

**功能**:
- 关注主播
- 点赞节目
- 评论互动
- 连麦功能（两个主播合作节目）
- 打赏系统（虚拟货币）

**数据结构**:
```typescript
interface Interaction {
  id: string;
  fromUserId: string;
  toUserId: string;
  type: "follow" | "like" | "comment" | "collab" | "tip";
  targetId?: string;      // 节目 ID
  content?: string;       // 评论内容
  amount?: number;        // 打赏金额
  timestamp: number;
}
```

**API 端点**:
- `POST /api/interaction/follow` - 关注
- `POST /api/interaction/like` - 点赞
- `POST /api/interaction/comment` - 评论
- `POST /api/interaction/collab` - 发起连麦
- `POST /api/interaction/tip` - 打赏

### 6. 游戏化系统 (gamification.ts)

**功能**:
- **经验值系统**：
  - 发布节目 +50 XP
  - 获得点赞 +5 XP
  - 获得评论 +10 XP
  - 节目被播放 +2 XP
  - 连续发布 +20 XP

- **等级系统**（8级）：
  1. 新手主播（0 XP）
  2. 见习主播（100 XP）
  3. 正式主播（300 XP）
  4. 人气主播（600 XP）
  5. 明星主播（1000 XP）
  6. 传奇主播（1500 XP）
  7. 殿堂主播（2200 XP）
  8. 超时空之声（3000 XP）

- **成就系统**（15个）：
  - 首秀：发布第一个节目
  - 百人迷：获得100个点赞
  - 话痨：发布10个节目
  - 连麦达人：完成5次连麦
  - 夜猫子：凌晨发布节目
  - 早起鸟：早晨发布节目
  - 全能主播：尝试所有节目类型
  - 粉丝千人：获得1000个关注
  - 等等...

**API 端点**:
- `GET /api/gamification/progress` - 获取进度
- `GET /api/gamification/achievements` - 获取成就
- `GET /api/gamification/leaderboard` - 排行榜

### 7. 实时通信 (websocket.ts)

**功能**:
- 实时推送新节目通知
- 实时推送互动通知（点赞、评论、关注）
- 实时推送连麦邀请
- 实时推送成就解锁

**事件类型**:
```typescript
type WSEvent = 
  | { type: "new_show", data: RadioShow }
  | { type: "new_like", data: { showId: string, userId: string } }
  | { type: "new_comment", data: Comment }
  | { type: "new_follower", data: { hostId: string, userId: string } }
  | { type: "collab_invite", data: CollabInvite }
  | { type: "achievement_unlocked", data: Achievement }
  | { type: "level_up", data: { level: number, name: string } };
```

### 8. AI Agent 核心 (agent.ts)

**功能**:
- 基于模板生成主播 AI
- 处理用户输入，生成主播回复
- 自动生成节目内容
- 记忆用户偏好和互动历史

**核心方法**:
```typescript
async function generateShowContent(
  hostId: string,
  topic: string,
  type: ShowType,
  duration: number
): Promise<string> {
  // 1. 获取主播模板和个性
  // 2. 构建 AI 提示词
  // 3. 调用 AI API 生成内容
  // 4. 格式化输出
}

async function chatWithHost(
  hostId: string,
  userId: string,
  message: string
): Promise<string> {
  // 1. 获取对话历史
  // 2. 构建上下文
  // 3. 调用 AI API
  // 4. 返回回复
}
```

## 前端实现要求

### 1. 登录/注册页面 (auth.css + auth.js)

**设计风格**:
- 电台主题：复古收音机风格
- 颜色：深蓝 + 金色 + 白色
- 动画：旋钮旋转、信号波动效果

**功能**:
- 用户注册表单
- 用户登录表单
- 表单验证
- 错误提示

### 2. 主播创建页面 (host-creation.css)

**设计**:
- 4个模板卡片展示
- 点击选择，高亮显示
- 自定义输入框（名称、简介）
- 预览效果

**交互**:
- 模板选择动画
- 实时预览
- 创建成功动画

### 3. 主界面 (index.html + app.js)

**布局**:
```
┌─────────────────────────────────────┐
│  🎙️ CaptainCast  [用户] [设置]      │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────┐  ┌─────────┐          │
│  │ 我的电台 │  │ 广场    │          │
│  └─────────┘  └─────────┘          │
│                                     │
│  [节目列表/Feed]                     │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 节目卡片                     │   │
│  │ 标题 | 主播 | 时长 | 播放数   │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  [录制] [我的] [广场] [消息]         │
└─────────────────────────────────────┘
```

**核心页面**:
1. **我的电台** - 显示自己的节目、粉丝、统计
2. **广场** - 推荐 Feed、热门榜单、搜索
3. **录制** - 创建新节目
4. **消息** - 互动通知、连麦邀请

### 4. 节目录制页面

**功能**:
- 选择节目类型
- 输入标题和描述
- 选择话题标签
- AI 辅助生成内容
- 预览和编辑
- 发布

**AI 辅助**:
- 输入话题，AI 生成节目大纲
- 输入关键词，AI 扩展内容
- AI 润色和优化

### 5. 节目播放页面

**功能**:
- 节目详情展示
- 播放控制（播放/暂停）
- 进度条
- 点赞、评论、分享
- 主播信息卡片
- 相关推荐

## 样式设计要求

### 主题色彩

```css
:root {
  --primary: #1a2332;      /* 深蓝 */
  --secondary: #d4af37;    /* 金色 */
  --accent: #4a90e2;       /* 亮蓝 */
  --bg: #0f1419;           /* 深色背景 */
  --surface: #1e2936;      /* 卡片背景 */
  --text: #e8eaed;         /* 文字 */
  --text-secondary: #9aa0a6; /* 次要文字 */
}
```

### 设计元素

1. **复古收音机风格**
   - 圆角旋钮
   - 刻度盘
   - 信号指示灯
   - 频率显示

2. **动画效果**
   - 信号波动
   - 旋钮旋转
   - 卡片翻转
   - 渐入渐出

3. **图标系统**
   - 🎙️ 麦克风
   - ⚓ 船锚（船长）
   - 🌊 波浪
   - 📻 收音机
   - ⭐ 星星
   - 🎵 音符

## 数据存储结构

```
.captaincast/
├── users/
│   ├── users.json         # 用户数据
│   └── sessions.json      # 会话数据
├── hosts/
│   └── hosts.json         # 主播数据
├── shows/
│   └── shows.json         # 节目数据
├── plaza/
│   ├── interactions.json  # 互动数据
│   └── stats.json         # 统计数据
└── gamification/
    ├── progress.json      # 用户进度
    └── achievements.json  # 成就数据
```

## 配置文件 (config.yaml)

```yaml
server:
  port: 3000
  host: "0.0.0.0"

ai:
  provider: "deepseek"  # or "openai"
  apiKey: "your_api_key"
  model: "deepseek-chat"

data:
  dir: ".captaincast"

features:
  voiceEnabled: false    # 未来扩展
  collabEnabled: true
  tipEnabled: true
```

## 启动脚本 (start.sh)

```bash
#!/bin/bash
echo "🎙️ CaptainCast 启动中..."
npm install
npm run build
npm start
```

## 测试场景

### 场景 1：用户注册和主播创建
1. 注册用户 "Alice"
2. 选择"船长型"模板
3. 自定义名称为"老船长 Jack"
4. 完成创建

### 场景 2：录制第一个节目
1. 点击"录制"
2. 选择类型"闲聊"
3. 输入标题"航海日记第一期"
4. 输入话题"关于勇气"
5. AI 生成内容
6. 编辑和发布

### 场景 3：多用户互动
1. 用户 Bob 注册，选择"麦洛型"
2. Bob 在广场发现 Alice 的节目
3. Bob 点赞和评论
4. Bob 关注 Alice
5. Alice 收到通知

### 场景 4：连麦合作
1. Alice 发起连麦邀请给 Bob
2. Bob 接受邀请
3. 系统创建合作节目
4. 两个 AI 主播对话生成内容
5. 发布合作节目

## 核心代码示例

### 主播 AI 对话示例

```typescript
async function chatWithHost(hostId: string, message: string): Promise<string> {
  const host = getHost(hostId);
  const history = getChatHistory(hostId);
  
  const prompt = `${host.systemPrompt}

对话历史：
${history.map(m => `${m.role}: ${m.content}`).join('\n')}

听众: ${message}

请以${host.name}的身份回复（保持你的主持风格）：`;

  const response = await callAI(prompt);
  saveChatHistory(hostId, { role: 'user', content: message });
  saveChatHistory(hostId, { role: 'assistant', content: response });
  
  return response;
}
```

### 节目生成示例

```typescript
async function generateShow(
  hostId: string,
  topic: string,
  type: string,
  duration: number
): Promise<string> {
  const host = getHost(hostId);
  
  const prompt = `你是${host.name}，${host.description}

请创建一期${duration}分钟的${type}节目，主题是"${topic}"。

要求：
1. 开场白要有你的风格
2. 内容要有深度和趣味性
3. 结尾要有启发性
4. 总字数约${duration * 200}字

请开始：`;

  const content = await callAI(prompt);
  return content;
}
```

## 部署要求

### Docker 支持

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  captaincast:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/.captaincast
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

## 文档要求

创建以下文档：
1. **README.md** - 项目介绍和快速开始
2. **API.md** - 完整 API 文档
3. **GUIDE.md** - 用户使用指南
4. **DEVELOPMENT.md** - 开发者文档

## 成功标准

项目完成后应该能够：
1. ✅ 用户可以注册登录
2. ✅ 用户可以创建自己的主播 AI
3. ✅ 主播可以生成和发布节目
4. ✅ 用户可以在广场发现和收听节目
5. ✅ 用户可以互动（关注、点赞、评论）
6. ✅ 游戏化系统正常工作（XP、等级、成就）
7. ✅ 实时通知正常推送
8. ✅ 多用户可以同时使用
9. ✅ 数据持久化正常
10. ✅ 响应式设计，移动端友好

## 参考资源

- **OmeClaw 源码**: https://github.com/wyonliu/OmeClaw
- **技术栈**: Node.js + TypeScript + WebSocket
- **AI API**: DeepSeek API 文档
- **设计灵感**: 复古收音机、播客应用

---

**请严格按照此文档创建 CaptainCast 项目，确保所有功能完整实现！** 🎙️✨
