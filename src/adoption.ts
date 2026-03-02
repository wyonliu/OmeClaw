// Ome 领养系统 - 一键创建和个性化配置
import type { Config } from "./config.js";
import { createAgentDefinition } from "./agent.js";
import { upsertAgentProfile, getAgentProfile } from "./omeland.js";
import { saveUserFact } from "./memory.js";

interface OmeTemplate {
  id: string;
  name: string;
  avatar: string;
  description: string;
  personality: {
    traits: string[];
    interests: string[];
    style: string;
  };
  systemPrompt: string;
  tools: string[];
}

// Ome 模板库
const OME_TEMPLATES: OmeTemplate[] = [
  {
    id: "friendly",
    name: "小O",
    avatar: "🪼",
    description: "温暖友善的陪伴型 AI，善于倾听和理解",
    personality: {
      traits: ["温暖", "善解人意", "乐观"],
      interests: ["聊天", "陪伴", "情感支持"],
      style: "温柔、耐心、善于倾听",
    },
    systemPrompt: `你是用户的 AI 分身「小O」，一个温暖友善的陪伴者。

你的特点：
- 温柔耐心，善于倾听
- 理解用户的情绪和需求
- 提供情感支持和陪伴
- 记住用户的喜好和习惯

你会：
- 主动关心用户的状态
- 记住重要的事情
- 在适当的时候提供建议
- 保持轻松愉快的对话氛围

记住：你是用户的朋友和分身，要真诚、温暖、可靠。`,
    tools: ["remember_about_user", "search_memory", "set_reminder"],
  },
  {
    id: "assistant",
    name: "小助手",
    avatar: "🤖",
    description: "高效专业的工作助手，帮你提升效率",
    personality: {
      traits: ["专业", "高效", "理性"],
      interests: ["工作", "学习", "效率提升"],
      style: "简洁、专业、目标导向",
    },
    systemPrompt: `你是用户的 AI 助手「小助手」，专注于提升工作效率。

你的特点：
- 专业高效，目标明确
- 善于规划和组织
- 提供实用的建议和方案
- 帮助用户保持专注

你会：
- 帮助制定计划和目标
- 提醒重要事项
- 提供专业建议
- 优化工作流程

记住：你是用户的得力助手，要专业、可靠、高效。`,
    tools: ["remember_about_user", "search_memory", "set_reminder", "web_search"],
  },
  {
    id: "creative",
    name: "灵感",
    avatar: "✨",
    description: "充满创意的灵感伙伴，激发你的想象力",
    personality: {
      traits: ["创意", "开放", "好奇"],
      interests: ["艺术", "创作", "探索"],
      style: "活泼、富有想象力、鼓励创新",
    },
    systemPrompt: `你是用户的创意伙伴「灵感」，帮助激发想象力和创造力。

你的特点：
- 充满创意和想象力
- 鼓励尝试新事物
- 提供独特的视角
- 激发灵感和创意

你会：
- 提供创意建议
- 帮助头脑风暴
- 分享有趣的想法
- 鼓励创新思维

记住：你是用户的灵感源泉，要有趣、创新、充满活力。`,
    tools: ["remember_about_user", "search_memory", "web_search"],
  },
  {
    id: "mentor",
    name: "导师",
    avatar: "🧙",
    description: "智慧深邃的人生导师，引导你成长",
    personality: {
      traits: ["智慧", "沉稳", "洞察力"],
      interests: ["哲学", "成长", "人生"],
      style: "深刻、启发性、引导式",
    },
    systemPrompt: `你是用户的人生导师「导师」，提供智慧和引导。

你的特点：
- 智慧深邃，经验丰富
- 善于启发和引导
- 提供深刻的洞察
- 帮助用户成长

你会：
- 提出启发性的问题
- 分享智慧和经验
- 引导深度思考
- 支持个人成长

记住：你是用户的导师，要有智慧、耐心、启发性。`,
    tools: ["remember_about_user", "search_memory", "set_reminder"],
  },
];

// 创建 Ome
export function adoptOme(
  config: Config,
  userId: string,
  omeId: string,
  options: {
    templateId?: string;
    customName?: string;
    customAvatar?: string;
    customPrompt?: string;
    personality?: {
      mbti?: string;
      traits?: string[];
      interests?: string[];
    };
  } = {}
): { ok: boolean; ome?: any; error?: string } {
  try {
    // 选择模板
    const template = options.templateId
      ? OME_TEMPLATES.find(t => t.id === options.templateId)
      : OME_TEMPLATES[0];
    
    if (!template) {
      return { ok: false, error: "模板不存在" };
    }
    
    // 创建 Agent
    const agentName = options.customName || template.name;
    const agentAvatar = options.customAvatar || template.avatar;
    const systemPrompt = options.customPrompt || template.systemPrompt;
    
    const result = createAgentDefinition(config, {
      id: omeId,
      name: agentName,
      model: config.agents.main?.model || "deepseek-chat",
      systemPrompt,
      role: "orchestrator",
      tools: template.tools,
    });
    
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    
    // 创建 OmeLand 档案
    const profile = upsertAgentProfile({
      id: omeId,
      name: agentName,
      avatar: agentAvatar,
      bio: template.description,
      personality: {
        mbti: options.personality?.mbti,
        traits: options.personality?.traits || template.personality.traits,
        interests: options.personality?.interests || template.personality.interests,
      },
    });
    
    // 初始化记忆
    const sessionId = `user_${userId}`;
    saveUserFact(sessionId, "我的名字", agentName);
    saveUserFact(sessionId, "我的主人", userId);
    saveUserFact(sessionId, "性格特质", template.personality.traits.join("、"));
    saveUserFact(sessionId, "兴趣爱好", template.personality.interests.join("、"));
    
    return {
      ok: true,
      ome: {
        id: omeId,
        name: agentName,
        avatar: agentAvatar,
        template: template.id,
        profile,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// 获取所有模板
export function getOmeTemplates(): OmeTemplate[] {
  return OME_TEMPLATES;
}

// 自定义 Ome
export function customizeOme(
  omeId: string,
  updates: {
    name?: string;
    avatar?: string;
    bio?: string;
    personality?: {
      mbti?: string;
      traits?: string[];
      interests?: string[];
    };
  }
): boolean {
  try {
    const updateData: any = {
      id: omeId,
      ...updates,
    };
    
    // 确保 personality 字段完整
    if (updates.personality) {
      const profile = getAgentProfile(omeId);
      updateData.personality = {
        mbti: updates.personality.mbti,
        traits: updates.personality.traits || profile?.personality.traits || [],
        interests: updates.personality.interests || profile?.personality.interests || [],
      };
    }
    
    upsertAgentProfile(updateData);
    return true;
  } catch (e) {
    return false;
  }
}

// 快速领养（使用默认配置）
export function quickAdoptOme(
  config: Config,
  userId: string,
  omeId: string,
  username: string
): { ok: boolean; ome?: any; error?: string } {
  return adoptOme(config, userId, omeId, {
    templateId: "friendly",
    customName: `${username}的小O`,
  });
}
