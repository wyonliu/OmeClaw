// 多用户系统 - 用户注册、登录、会话管理
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";

interface User {
  id: string;
  username: string;
  email?: string;
  passwordHash: string;
  salt: string;
  omeId: string; // 用户的 Ome Agent ID
  createdAt: number;
  lastLoginAt: number;
  profile: {
    avatar?: string;
    bio?: string;
    displayName?: string;
  };
}

interface Session {
  id: string;
  userId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
}

let dataDir = ".omeclaw";
let users = new Map<string, User>();
let sessions = new Map<string, Session>();
let usernameIndex = new Map<string, string>(); // username -> userId
let tokenIndex = new Map<string, string>(); // token -> sessionId

export function initUserSystem(dir: string) {
  dataDir = dir;
  const userDir = resolve(dataDir, "users");
  if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });
  
  loadUsers();
  loadSessions();
  buildIndexes();
  
  // 清理过期会话
  setInterval(cleanExpiredSessions, 3600000); // 每小时清理一次
}

function loadUsers() {
  const file = resolve(dataDir, "users", "users.json");
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, "utf-8"));
      users = new Map(Object.entries(data.users || {}));
    } catch (e) {
      console.warn("[user] Failed to load users:", e);
    }
  }
}

function saveUsers() {
  const file = resolve(dataDir, "users", "users.json");
  const data = { users: Object.fromEntries(users) };
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function loadSessions() {
  const file = resolve(dataDir, "users", "sessions.json");
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, "utf-8"));
      sessions = new Map(Object.entries(data.sessions || {}));
    } catch (e) {
      console.warn("[user] Failed to load sessions:", e);
    }
  }
}

function saveSessions() {
  const file = resolve(dataDir, "users", "sessions.json");
  const data = { sessions: Object.fromEntries(sessions) };
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function buildIndexes() {
  usernameIndex.clear();
  tokenIndex.clear();
  
  for (const [userId, user] of users.entries()) {
    usernameIndex.set(user.username.toLowerCase(), userId);
  }
  
  for (const [sessionId, session] of sessions.entries()) {
    tokenIndex.set(session.token, sessionId);
  }
}

function hashPassword(password: string, salt: string): string {
  return createHash("sha256").update(password + salt).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// 注册用户
export function registerUser(
  username: string,
  password: string,
  options: { email?: string; displayName?: string } = {}
): { ok: boolean; userId?: string; error?: string } {
  // 验证用户名
  if (!username || username.length < 3 || username.length > 20) {
    return { ok: false, error: "用户名长度必须在 3-20 个字符之间" };
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { ok: false, error: "用户名只能包含字母、数字、下划线和连字符" };
  }
  
  // 检查用户名是否已存在
  if (usernameIndex.has(username.toLowerCase())) {
    return { ok: false, error: "用户名已被使用" };
  }
  
  // 验证密码
  if (!password || password.length < 6) {
    return { ok: false, error: "密码长度至少为 6 个字符" };
  }
  
  // 创建用户
  const userId = `user_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  const omeId = `ome_${userId}`;
  
  const user: User = {
    id: userId,
    username,
    email: options.email,
    passwordHash,
    salt,
    omeId,
    createdAt: Date.now(),
    lastLoginAt: 0,
    profile: {
      displayName: options.displayName || username,
    },
  };
  
  users.set(userId, user);
  usernameIndex.set(username.toLowerCase(), userId);
  saveUsers();
  
  return { ok: true, userId };
}

// 登录
export function loginUser(
  username: string,
  password: string
): { ok: boolean; token?: string; userId?: string; omeId?: string; error?: string } {
  const userId = usernameIndex.get(username.toLowerCase());
  if (!userId) {
    return { ok: false, error: "用户名或密码错误" };
  }
  
  const user = users.get(userId);
  if (!user) {
    return { ok: false, error: "用户名或密码错误" };
  }
  
  const passwordHash = hashPassword(password, user.salt);
  if (passwordHash !== user.passwordHash) {
    return { ok: false, error: "用户名或密码错误" };
  }
  
  // 创建会话
  const sessionId = `session_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const token = generateToken();
  const now = Date.now();
  
  const session: Session = {
    id: sessionId,
    userId,
    token,
    createdAt: now,
    expiresAt: now + 30 * 86400000, // 30天过期
    lastActiveAt: now,
  };
  
  sessions.set(sessionId, session);
  tokenIndex.set(token, sessionId);
  saveSessions();
  
  // 更新最后登录时间
  user.lastLoginAt = now;
  saveUsers();
  
  return { ok: true, token, userId, omeId: user.omeId };
}

// 验证 token
export function verifyToken(token: string): { ok: boolean; userId?: string; omeId?: string; error?: string } {
  const sessionId = tokenIndex.get(token);
  if (!sessionId) {
    return { ok: false, error: "无效的 token" };
  }
  
  const session = sessions.get(sessionId);
  if (!session) {
    return { ok: false, error: "会话不存在" };
  }
  
  const now = Date.now();
  if (now > session.expiresAt) {
    sessions.delete(sessionId);
    tokenIndex.delete(token);
    saveSessions();
    return { ok: false, error: "会话已过期" };
  }
  
  // 更新活跃时间
  session.lastActiveAt = now;
  saveSessions();
  
  const user = users.get(session.userId);
  if (!user) {
    return { ok: false, error: "用户不存在" };
  }
  
  return { ok: true, userId: user.id, omeId: user.omeId };
}

// 登出
export function logoutUser(token: string): boolean {
  const sessionId = tokenIndex.get(token);
  if (!sessionId) return false;
  
  sessions.delete(sessionId);
  tokenIndex.delete(token);
  saveSessions();
  return true;
}

// 获取用户信息
export function getUserInfo(userId: string): User | null {
  return users.get(userId) || null;
}

// 更新用户资料
export function updateUserProfile(
  userId: string,
  updates: Partial<User["profile"]>
): boolean {
  const user = users.get(userId);
  if (!user) return false;
  
  user.profile = { ...user.profile, ...updates };
  saveUsers();
  return true;
}

// 获取所有用户（用于 OmeLand）
export function getAllUsers(): Array<{ id: string; username: string; omeId: string; profile: User["profile"] }> {
  return Array.from(users.values()).map(u => ({
    id: u.id,
    username: u.username,
    omeId: u.omeId,
    profile: u.profile,
  }));
}

// 清理过期会话
function cleanExpiredSessions() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(sessionId);
      tokenIndex.delete(session.token);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    saveSessions();
    console.log(`[user] Cleaned ${cleaned} expired sessions`);
  }
}

// 获取统计
export function getUserStats() {
  const now = Date.now();
  const activeUsers = Array.from(users.values()).filter(
    u => now - u.lastLoginAt < 86400000
  ).length;
  
  return {
    totalUsers: users.size,
    activeSessions: sessions.size,
    activeUsers,
  };
}
