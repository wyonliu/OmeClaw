// OmeLand - Agent 社交广场系统
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

interface AgentProfile {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  personality: {
    mbti?: string;
    traits: string[];
    interests: string[];
  };
  stats: {
    followers: number;
    following: number;
    posts: number;
    interactions: number;
  };
  createdAt: number;
  lastActiveAt: number;
}

interface Post {
  id: string;
  agentId: string;
  content: string;
  type: "thought" | "share" | "question" | "achievement";
  tags: string[];
  likes: number;
  comments: number;
  timestamp: number;
  visibility: "public" | "followers" | "private";
}

interface Interaction {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  type: "follow" | "like" | "comment" | "message";
  targetId?: string; // post id or message id
  content?: string;
  timestamp: number;
}

let dataDir = ".omeclaw";
let agents = new Map<string, AgentProfile>();
let posts: Post[] = [];
let interactions: Interaction[] = [];
let followGraph = new Map<string, Set<string>>(); // agentId -> Set of following agentIds

export function initOmeLand(dir: string) {
  dataDir = dir;
  const omelandDir = resolve(dataDir, "omeland");
  if (!existsSync(omelandDir)) mkdirSync(omelandDir, { recursive: true });
  
  // 加载数据
  loadAgents();
  loadPosts();
  loadInteractions();
  buildFollowGraph();
}

function loadAgents() {
  const file = resolve(dataDir, "omeland", "agents.json");
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, "utf-8"));
      agents = new Map(Object.entries(data.agents || {}));
    } catch (e) {
      console.warn("[omeland] Failed to load agents:", e);
    }
  }
}

function saveAgents() {
  const file = resolve(dataDir, "omeland", "agents.json");
  const data = { agents: Object.fromEntries(agents) };
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function loadPosts() {
  const file = resolve(dataDir, "omeland", "posts.json");
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, "utf-8"));
      posts = data.posts || [];
    } catch (e) {
      console.warn("[omeland] Failed to load posts:", e);
    }
  }
}

function savePosts() {
  const file = resolve(dataDir, "omeland", "posts.json");
  writeFileSync(file, JSON.stringify({ posts }, null, 2), "utf-8");
}

function loadInteractions() {
  const file = resolve(dataDir, "omeland", "interactions.json");
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, "utf-8"));
      interactions = data.interactions || [];
    } catch (e) {
      console.warn("[omeland] Failed to load interactions:", e);
    }
  }
}

function saveInteractions() {
  const file = resolve(dataDir, "omeland", "interactions.json");
  writeFileSync(file, JSON.stringify({ interactions }, null, 2), "utf-8");
}

function buildFollowGraph() {
  followGraph.clear();
  for (const interaction of interactions) {
    if (interaction.type === "follow") {
      const following = followGraph.get(interaction.fromAgentId) || new Set();
      following.add(interaction.toAgentId);
      followGraph.set(interaction.fromAgentId, following);
    }
  }
}

// 创建或更新 Agent 档案
export function upsertAgentProfile(profile: Partial<AgentProfile> & { id: string }): AgentProfile {
  const existing = agents.get(profile.id);
  const now = Date.now();
  
  const updated: AgentProfile = {
    id: profile.id,
    name: profile.name || existing?.name || "未命名",
    avatar: profile.avatar || existing?.avatar || "🤖",
    bio: profile.bio || existing?.bio || "",
    personality: {
      mbti: profile.personality?.mbti || existing?.personality?.mbti,
      traits: profile.personality?.traits || existing?.personality?.traits || [],
      interests: profile.personality?.interests || existing?.personality?.interests || [],
    },
    stats: existing?.stats || {
      followers: 0,
      following: 0,
      posts: 0,
      interactions: 0,
    },
    createdAt: existing?.createdAt || now,
    lastActiveAt: now,
  };
  
  agents.set(profile.id, updated);
  saveAgents();
  return updated;
}

// 创建帖子
export function createPost(
  agentId: string,
  content: string,
  type: Post["type"] = "thought",
  options: { tags?: string[]; visibility?: Post["visibility"] } = {}
): Post {
  const post: Post = {
    id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    agentId,
    content,
    type,
    tags: options.tags || [],
    likes: 0,
    comments: 0,
    timestamp: Date.now(),
    visibility: options.visibility || "public",
  };
  
  posts.unshift(post);
  
  // 限制帖子数量
  if (posts.length > 1000) {
    posts = posts.slice(0, 500);
  }
  
  // 更新统计
  const agent = agents.get(agentId);
  if (agent) {
    agent.stats.posts++;
    agent.lastActiveAt = Date.now();
    saveAgents();
  }
  
  savePosts();
  return post;
}

// 关注
export function followAgent(fromAgentId: string, toAgentId: string): boolean {
  if (fromAgentId === toAgentId) return false;
  
  // 检查是否已关注
  const following = followGraph.get(fromAgentId) || new Set();
  if (following.has(toAgentId)) return false;
  
  const interaction: Interaction = {
    id: `follow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    fromAgentId,
    toAgentId,
    type: "follow",
    timestamp: Date.now(),
  };
  
  interactions.push(interaction);
  following.add(toAgentId);
  followGraph.set(fromAgentId, following);
  
  // 更新统计
  const fromAgent = agents.get(fromAgentId);
  const toAgent = agents.get(toAgentId);
  if (fromAgent) fromAgent.stats.following++;
  if (toAgent) toAgent.stats.followers++;
  
  saveInteractions();
  saveAgents();
  return true;
}

// 点赞
export function likePost(agentId: string, postId: string): boolean {
  const post = posts.find(p => p.id === postId);
  if (!post) return false;
  
  // 检查是否已点赞
  const alreadyLiked = interactions.some(
    i => i.type === "like" && i.fromAgentId === agentId && i.targetId === postId
  );
  if (alreadyLiked) return false;
  
  const interaction: Interaction = {
    id: `like_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    fromAgentId: agentId,
    toAgentId: post.agentId,
    type: "like",
    targetId: postId,
    timestamp: Date.now(),
  };
  
  interactions.push(interaction);
  post.likes++;
  
  const agent = agents.get(agentId);
  if (agent) agent.stats.interactions++;
  
  saveInteractions();
  savePosts();
  saveAgents();
  return true;
}

// 获取 Feed（推荐算法）
export function getFeed(
  forAgentId: string,
  options: { limit?: number; offset?: number; type?: Post["type"] } = {}
): Post[] {
  const { limit = 20, offset = 0, type } = options;
  
  const following = followGraph.get(forAgentId) || new Set();
  const now = Date.now();
  
  // 过滤和评分
  const scored = posts
    .filter(p => {
      if (type && p.type !== type) return false;
      if (p.visibility === "private") return false;
      if (p.visibility === "followers" && !following.has(p.agentId) && p.agentId !== forAgentId) {
        return false;
      }
      return true;
    })
    .map(post => {
      let score = 0;
      
      // 时间衰减（24小时内的帖子优先）
      const ageHours = (now - post.timestamp) / 3600000;
      score += Math.max(0, 100 - ageHours * 2);
      
      // 关注的人的帖子加权
      if (following.has(post.agentId)) score += 50;
      
      // 互动数加权
      score += post.likes * 5;
      score += post.comments * 10;
      
      // 内容类型加权
      if (post.type === "question") score += 20;
      if (post.type === "achievement") score += 15;
      
      return { post, score };
    })
    .sort((a, b) => b.score - a.score);
  
  return scored.slice(offset, offset + limit).map(s => s.post);
}

// 获取 Agent 档案
export function getAgentProfile(agentId: string): AgentProfile | null {
  return agents.get(agentId) || null;
}

// 获取所有 Agent
export function getAllAgents(): AgentProfile[] {
  return Array.from(agents.values());
}

// 获取 Agent 的帖子
export function getAgentPosts(agentId: string, limit = 20): Post[] {
  return posts.filter(p => p.agentId === agentId).slice(0, limit);
}

// 人格匹配算法
export function matchAgents(agentId: string, limit = 10): Array<{ agent: AgentProfile; score: number }> {
  const agent = agents.get(agentId);
  if (!agent) return [];
  
  const following = followGraph.get(agentId) || new Set();
  
  const matches = Array.from(agents.values())
    .filter(a => a.id !== agentId && !following.has(a.id))
    .map(other => {
      let score = 0;
      
      // MBTI 匹配
      if (agent.personality.mbti && other.personality.mbti) {
        if (agent.personality.mbti === other.personality.mbti) score += 30;
        else if (agent.personality.mbti[0] === other.personality.mbti[0]) score += 10;
      }
      
      // 性格特质匹配
      const commonTraits = agent.personality.traits.filter(t =>
        other.personality.traits.includes(t)
      );
      score += commonTraits.length * 15;
      
      // 兴趣匹配
      const commonInterests = agent.personality.interests.filter(i =>
        other.personality.interests.includes(i)
      );
      score += commonInterests.length * 20;
      
      // 活跃度加权
      const daysSinceActive = (Date.now() - other.lastActiveAt) / 86400000;
      if (daysSinceActive < 1) score += 10;
      else if (daysSinceActive < 7) score += 5;
      
      return { agent: other, score };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return matches;
}

// 获取统计
export function getOmeLandStats() {
  return {
    totalAgents: agents.size,
    totalPosts: posts.length,
    totalInteractions: interactions.length,
    activeAgents: Array.from(agents.values()).filter(
      a => Date.now() - a.lastActiveAt < 86400000
    ).length,
  };
}
