// 游戏化系统：XP、等级、成就
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

interface UserProgress {
  xp: number;
  level: number;
  achievements: string[];
  stats: {
    totalMessages: number;
    totalFacts: number;
    daysActive: number;
    lastActiveDate: string;
    streakDays: number;
    toolsUsed: Set<string>;
    agentsInteracted: Set<string>;
  };
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  xpReward: number;
  condition: (progress: UserProgress) => boolean;
}

let dataDir = ".omeclaw";
let userProgress: UserProgress = {
  xp: 0,
  level: 1,
  achievements: [],
  stats: {
    totalMessages: 0,
    totalFacts: 0,
    daysActive: 0,
    lastActiveDate: "",
    streakDays: 0,
    toolsUsed: new Set(),
    agentsInteracted: new Set(),
  },
};

// 等级配置
const LEVEL_THRESHOLDS = [
  { level: 1, xp: 0, name: "初见", emoji: "🫧" },
  { level: 2, xp: 100, name: "相识", emoji: "🪼" },
  { level: 3, xp: 300, name: "熟悉", emoji: "💙" },
  { level: 4, xp: 600, name: "知己", emoji: "💎" },
  { level: 5, xp: 1000, name: "挚友", emoji: "🌊" },
  { level: 6, xp: 1500, name: "灵魂伴侣", emoji: "✨" },
  { level: 7, xp: 2200, name: "命运共同体", emoji: "🌌" },
  { level: 8, xp: 3000, name: "超越时空", emoji: "🔮" },
];

// 成就定义
const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_chat",
    name: "破冰",
    description: "发送第一条消息",
    emoji: "💬",
    xpReward: 10,
    condition: (p) => p.stats.totalMessages >= 1,
  },
  {
    id: "chat_10",
    name: "健谈",
    description: "发送 10 条消息",
    emoji: "🗣️",
    xpReward: 20,
    condition: (p) => p.stats.totalMessages >= 10,
  },
  {
    id: "chat_100",
    name: "话痨",
    description: "发送 100 条消息",
    emoji: "💭",
    xpReward: 50,
    condition: (p) => p.stats.totalMessages >= 100,
  },
  {
    id: "first_fact",
    name: "记忆萌芽",
    description: "创建第一条记忆",
    emoji: "🧠",
    xpReward: 15,
    condition: (p) => p.stats.totalFacts >= 1,
  },
  {
    id: "fact_10",
    name: "记忆宝库",
    description: "积累 10 条记忆",
    emoji: "📚",
    xpReward: 30,
    condition: (p) => p.stats.totalFacts >= 10,
  },
  {
    id: "fact_50",
    name: "记忆大师",
    description: "积累 50 条记忆",
    emoji: "🏆",
    xpReward: 100,
    condition: (p) => p.stats.totalFacts >= 50,
  },
  {
    id: "streak_3",
    name: "三日之约",
    description: "连续活跃 3 天",
    emoji: "🔥",
    xpReward: 25,
    condition: (p) => p.stats.streakDays >= 3,
  },
  {
    id: "streak_7",
    name: "一周陪伴",
    description: "连续活跃 7 天",
    emoji: "⭐",
    xpReward: 50,
    condition: (p) => p.stats.streakDays >= 7,
  },
  {
    id: "streak_30",
    name: "月度挚友",
    description: "连续活跃 30 天",
    emoji: "💫",
    xpReward: 200,
    condition: (p) => p.stats.streakDays >= 30,
  },
  {
    id: "tool_explorer",
    name: "工具探索者",
    description: "使用 5 种不同工具",
    emoji: "🔧",
    xpReward: 40,
    condition: (p) => p.stats.toolsUsed.size >= 5,
  },
  {
    id: "agent_socializer",
    name: "社交达人",
    description: "与 3 个不同 Agent 互动",
    emoji: "🤝",
    xpReward: 35,
    condition: (p) => p.stats.agentsInteracted.size >= 3,
  },
  {
    id: "level_5",
    name: "挚友之证",
    description: "达到 5 级",
    emoji: "🎖️",
    xpReward: 100,
    condition: (p) => p.level >= 5,
  },
  {
    id: "early_bird",
    name: "晨曦使者",
    description: "在早上 6-8 点活跃",
    emoji: "🌅",
    xpReward: 20,
    condition: () => false, // 需要特殊触发
  },
  {
    id: "night_owl",
    name: "夜猫子",
    description: "在凌晨 0-2 点活跃",
    emoji: "🦉",
    xpReward: 20,
    condition: () => false, // 需要特殊触发
  },
];

export function initGamification(dir: string) {
  dataDir = dir;
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  
  const progressFile = resolve(dataDir, "progress.json");
  if (existsSync(progressFile)) {
    try {
      const data = JSON.parse(readFileSync(progressFile, "utf-8"));
      userProgress = {
        ...data,
        stats: {
          ...data.stats,
          toolsUsed: new Set(data.stats.toolsUsed || []),
          agentsInteracted: new Set(data.stats.agentsInteracted || []),
        },
      };
    } catch (e) {
      console.warn("[gamification] Failed to load progress:", e);
    }
  }
  
  // 检查连续登录
  updateStreakDays();
}

function saveProgress() {
  const progressFile = resolve(dataDir, "progress.json");
  const data = {
    ...userProgress,
    stats: {
      ...userProgress.stats,
      toolsUsed: Array.from(userProgress.stats.toolsUsed),
      agentsInteracted: Array.from(userProgress.stats.agentsInteracted),
    },
  };
  writeFileSync(progressFile, JSON.stringify(data, null, 2), "utf-8");
}

function updateStreakDays() {
  const today = new Date().toISOString().split("T")[0];
  const lastActive = userProgress.stats.lastActiveDate;
  
  if (!lastActive) {
    userProgress.stats.streakDays = 1;
    userProgress.stats.daysActive = 1;
  } else if (lastActive === today) {
    // 同一天，不更新
    return;
  } else {
    const lastDate = new Date(lastActive);
    const todayDate = new Date(today);
    const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / 86400000);
    
    if (diffDays === 1) {
      // 连续登录
      userProgress.stats.streakDays++;
    } else {
      // 断签
      userProgress.stats.streakDays = 1;
    }
    userProgress.stats.daysActive++;
  }
  
  userProgress.stats.lastActiveDate = today;
  saveProgress();
  
  // 检查时间段成就
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 8) {
    unlockAchievement("early_bird");
  } else if (hour >= 0 && hour < 2) {
    unlockAchievement("night_owl");
  }
}

export function addXP(amount: number, _reason?: string): { levelUp: boolean; newLevel?: number; newLevelName?: string } {
  const oldLevel = userProgress.level;
  userProgress.xp += amount;
  
  // 计算新等级
  let newLevel = 1;
  for (const threshold of LEVEL_THRESHOLDS) {
    if (userProgress.xp >= threshold.xp) {
      newLevel = threshold.level;
    } else {
      break;
    }
  }
  
  userProgress.level = newLevel;
  saveProgress();
  
  const levelUp = newLevel > oldLevel;
  if (levelUp) {
    const levelInfo = LEVEL_THRESHOLDS.find(l => l.level === newLevel);
    return { levelUp: true, newLevel, newLevelName: levelInfo?.name };
  }
  
  return { levelUp: false };
}

export function trackMessage(agentId: string) {
  userProgress.stats.totalMessages++;
  userProgress.stats.agentsInteracted.add(agentId);
  updateStreakDays();
  
  // 检查成就
  checkAchievements();
  
  // 每条消息奖励 1 XP
  addXP(1, "message");
  
  saveProgress();
}

export function trackFact(count: number) {
  userProgress.stats.totalFacts = count;
  checkAchievements();
  saveProgress();
}

export function trackToolUse(toolName: string) {
  userProgress.stats.toolsUsed.add(toolName);
  checkAchievements();
  saveProgress();
}

function checkAchievements(): string[] {
  const newAchievements: string[] = [];
  
  for (const achievement of ACHIEVEMENTS) {
    if (userProgress.achievements.includes(achievement.id)) continue;
    
    if (achievement.condition(userProgress)) {
      unlockAchievement(achievement.id);
      newAchievements.push(achievement.id);
    }
  }
  
  return newAchievements;
}

export function unlockAchievement(achievementId: string): boolean {
  if (userProgress.achievements.includes(achievementId)) return false;
  
  const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
  if (!achievement) return false;
  
  userProgress.achievements.push(achievementId);
  addXP(achievement.xpReward, `achievement:${achievementId}`);
  saveProgress();
  
  return true;
}

export function getProgress() {
  const currentLevelInfo = LEVEL_THRESHOLDS.find(l => l.level === userProgress.level);
  const nextLevelInfo = LEVEL_THRESHOLDS.find(l => l.level === userProgress.level + 1);
  
  const currentLevelXP = currentLevelInfo?.xp || 0;
  const nextLevelXP = nextLevelInfo?.xp || currentLevelXP;
  const progressToNext = nextLevelInfo 
    ? Math.round(((userProgress.xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100)
    : 100;
  
  return {
    xp: userProgress.xp,
    level: userProgress.level,
    levelName: currentLevelInfo?.name || "初见",
    levelEmoji: currentLevelInfo?.emoji || "🫧",
    nextLevel: nextLevelInfo?.level,
    nextLevelName: nextLevelInfo?.name,
    nextLevelXP,
    progressToNext,
    achievements: userProgress.achievements.map(id => {
      const a = ACHIEVEMENTS.find(x => x.id === id);
      return a ? { id: a.id, name: a.name, emoji: a.emoji, description: a.description } : null;
    }).filter(Boolean),
    stats: {
      ...userProgress.stats,
      toolsUsed: Array.from(userProgress.stats.toolsUsed),
      agentsInteracted: Array.from(userProgress.stats.agentsInteracted),
    },
  };
}

export function getAllAchievements() {
  return ACHIEVEMENTS.map(a => ({
    id: a.id,
    name: a.name,
    description: a.description,
    emoji: a.emoji,
    xpReward: a.xpReward,
    unlocked: userProgress.achievements.includes(a.id),
  }));
}

export function getLevelInfo(level: number) {
  return LEVEL_THRESHOLDS.find(l => l.level === level);
}

export function getAllLevels() {
  return LEVEL_THRESHOLDS;
}
