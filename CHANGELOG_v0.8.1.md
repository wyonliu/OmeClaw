# OmeClaw v0.8.1 更新日志

## 🚀 重大更新

基于OpenClaw源码分析，我们学习了其优秀的架构设计，同时保持OmeClaw的情感陪伴特色。

### ✨ 新增功能

#### 1. Telegram Bot集成
- 使用grammY框架
- 支持私聊和群聊
- 会话管理和路由
- 命令支持：/start, /status, /reset

#### 2. 增强记忆系统
- 添加情感维度（emotional_valence）
- 记忆重要性权重（importance 1-10）
- 关联记忆网络（related_memories）
- 访问计数和时间追踪
- 记忆类型分类（fact/emotion/event/preference）

#### 3. 主动触达系统
- 早安问候（6-10点）
- 晚安问候（22-23点）
- 长时间未活跃关心（72小时）
- 节日祝福（自动检测）
- 特殊日期提醒

### 🎯 核心改进

#### 学习OpenClaw的优点
- Gateway架构思想（统一控制平面）
- 多渠道支持（Telegram集成）
- 会话管理（多会话隔离）

#### 保持OmeClaw特色
- 情感连接（主动问候、共情）
- 记忆深度（11层记忆模型）
- 游戏化养成（Streak、等级、成就）
- 简单易用（零配置启动）

### 📊 技术栈

- **Telegram**: grammY框架
- **记忆系统**: SQLite + 增强索引
- **主动触达**: 定时任务系统
- **TypeScript**: 类型安全

### 🔧 API变更

#### 新增API
- `initTelegramBot(token)` - 初始化Telegram Bot
- `getTelegramBot()` - 获取Bot实例
- `initEnhancedMemory(dataDir)` - 初始化增强记忆
- `saveEnhancedMemory(params)` - 保存增强记忆
- `retrieveRelevantMemories(params)` - 检索相关记忆
- `getProactiveSystem()` - 获取主动触达系统
- `startProactiveScheduler(callback)` - 启动定时任务

### 📝 使用示例

#### Telegram Bot
```typescript
import { initTelegramBot } from './telegram-bot.js';

const bot = initTelegramBot(process.env.TELEGRAM_BOT_TOKEN);
await bot.start();
```

#### 增强记忆
```typescript
import { saveEnhancedMemory, retrieveRelevantMemories } from './enhanced-memory.js';

// 保存记忆
saveEnhancedMemory({
  sessionKey: 'owner',
  agentId: 'ome',
  content: '用户喜欢吃披萨',
  type: 'preference',
  importance: 7,
  emotionalValence: 0.8,
  tags: ['食物', '喜好']
});

// 检索记忆
const memories = retrieveRelevantMemories({
  sessionKey: 'owner',
  agentId: 'ome',
  query: '披萨',
  minImportance: 5,
  limit: 10
});
```

#### 主动触达
```typescript
import { startProactiveScheduler } from './proactive.js';

startProactiveScheduler((sessionId, message) => {
  console.log(`[${sessionId}] ${message.type}: ${message.message}`);
  // 发送消息到用户
});
```

### 🐛 Bug修复

- 修复TypeScript编译警告
- 修复依赖冲突（使用--legacy-peer-deps）
- 优化内存使用

### 📈 性能优化

- 增强记忆索引优化
- 会话管理优化
- 定时任务优化

### 🎨 UI/UX改进

- 保持原有UI不变
- 后续版本将优化

### 🔜 下一步计划

- 工具系统（浏览器控制、文件操作）
- UI/UX全面优化
- 性能测试和优化
- 更多渠道集成（Discord、Slack）

---

**定位**：OmeClaw是情感陪伴型AI分身，不是工具型助手。我们学习OpenClaw的架构，但保持自己的特色。

**对标**：Replika、Character.AI、Pi（不是OpenClaw）

**核心价值**：情感连接 > 功能执行
