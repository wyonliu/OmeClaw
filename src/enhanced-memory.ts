/**
 * 增强记忆系统 v0.8.1
 * 添加情感维度和重要性权重
 */

import Database from "better-sqlite3";
import { resolve } from "node:path";

let enhancedDb: Database.Database;

export interface EnhancedMemory {
  id: number;
  session_key: string;
  agent_id: string;
  content: string;
  type: 'fact' | 'emotion' | 'event' | 'preference';
  importance: number; // 1-10
  emotional_valence: number; // -1 to 1
  tags: string;
  related_memories: string; // JSON array of IDs
  access_count: number;
  last_accessed: number;
  created_at: number;
}

export function initEnhancedMemory(dataDir: string) {
  enhancedDb = new Database(resolve(dataDir, "enhanced-memory.db"));
  enhancedDb.pragma("journal_mode = WAL");
  
  enhancedDb.exec(`
    CREATE TABLE IF NOT EXISTS enhanced_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'fact',
      importance INTEGER DEFAULT 5,
      emotional_valence REAL DEFAULT 0,
      tags TEXT DEFAULT '[]',
      related_memories TEXT DEFAULT '[]',
      access_count INTEGER DEFAULT 0,
      last_accessed INTEGER DEFAULT (unixepoch()),
      created_at INTEGER DEFAULT (unixepoch())
    );
    
    CREATE INDEX IF NOT EXISTS idx_enhanced_session ON enhanced_memories(session_key, agent_id);
    CREATE INDEX IF NOT EXISTS idx_enhanced_importance ON enhanced_memories(importance DESC);
    CREATE INDEX IF NOT EXISTS idx_enhanced_type ON enhanced_memories(type);
    CREATE INDEX IF NOT EXISTS idx_enhanced_accessed ON enhanced_memories(last_accessed DESC);
  `);
  
  console.log("✅ 增强记忆系统已初始化");
}

/**
 * 保存增强记忆
 */
export function saveEnhancedMemory(params: {
  sessionKey: string;
  agentId: string;
  content: string;
  type?: 'fact' | 'emotion' | 'event' | 'preference';
  importance?: number;
  emotionalValence?: number;
  tags?: string[];
}): number {
  const {
    sessionKey,
    agentId,
    content,
    type = 'fact',
    importance = 5,
    emotionalValence = 0,
    tags = []
  } = params;
  
  const result = enhancedDb.prepare(`
    INSERT INTO enhanced_memories 
    (session_key, agent_id, content, type, importance, emotional_valence, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionKey,
    agentId,
    content,
    type,
    importance,
    emotionalValence,
    JSON.stringify(tags)
  );
  
  return result.lastInsertRowid as number;
}

/**
 * 检索相关记忆（带权重排序）
 */
export function retrieveRelevantMemories(params: {
  sessionKey: string;
  agentId: string;
  query?: string;
  type?: string;
  minImportance?: number;
  limit?: number;
}): EnhancedMemory[] {
  const {
    sessionKey,
    agentId,
    query,
    type,
    minImportance = 3,
    limit = 10
  } = params;
  
  let sql = `
    SELECT * FROM enhanced_memories 
    WHERE session_key = ? AND agent_id = ?
  `;
  const args: any[] = [sessionKey, agentId];
  
  if (type) {
    sql += ` AND type = ?`;
    args.push(type);
  }
  
  if (minImportance) {
    sql += ` AND importance >= ?`;
    args.push(minImportance);
  }
  
  if (query) {
    sql += ` AND content LIKE ?`;
    args.push(`%${query}%`);
  }
  
  // 按重要性和最近访问时间排序
  sql += ` ORDER BY importance DESC, last_accessed DESC LIMIT ?`;
  args.push(limit);
  
  const memories = enhancedDb.prepare(sql).all(...args) as EnhancedMemory[];
  
  // 更新访问计数和时间
  memories.forEach(m => {
    enhancedDb.prepare(`
      UPDATE enhanced_memories 
      SET access_count = access_count + 1, last_accessed = unixepoch()
      WHERE id = ?
    `).run(m.id);
  });
  
  return memories;
}

/**
 * 获取情感记忆
 */
export function getEmotionalMemories(params: {
  sessionKey: string;
  agentId: string;
  valenceRange?: [number, number];
  limit?: number;
}): EnhancedMemory[] {
  const {
    sessionKey,
    agentId,
    valenceRange = [-1, 1],
    limit = 10
  } = params;
  
  return enhancedDb.prepare(`
    SELECT * FROM enhanced_memories 
    WHERE session_key = ? AND agent_id = ? 
    AND type = 'emotion'
    AND emotional_valence BETWEEN ? AND ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(sessionKey, agentId, valenceRange[0], valenceRange[1], limit) as EnhancedMemory[];
}

/**
 * 更新记忆重要性
 */
export function updateMemoryImportance(memoryId: number, importance: number) {
  enhancedDb.prepare(`
    UPDATE enhanced_memories 
    SET importance = ?
    WHERE id = ?
  `).run(Math.max(1, Math.min(10, importance)), memoryId);
}

/**
 * 添加关联记忆
 */
export function linkMemories(memoryId1: number, memoryId2: number) {
  const memory1 = enhancedDb.prepare(`
    SELECT related_memories FROM enhanced_memories WHERE id = ?
  `).get(memoryId1) as { related_memories: string } | undefined;
  
  if (memory1) {
    const related = JSON.parse(memory1.related_memories || '[]');
    if (!related.includes(memoryId2)) {
      related.push(memoryId2);
      enhancedDb.prepare(`
        UPDATE enhanced_memories 
        SET related_memories = ?
        WHERE id = ?
      `).run(JSON.stringify(related), memoryId1);
    }
  }
}

/**
 * 获取记忆统计
 */
export function getMemoryStats(sessionKey: string, agentId: string) {
  const total = enhancedDb.prepare(`
    SELECT COUNT(*) as count FROM enhanced_memories 
    WHERE session_key = ? AND agent_id = ?
  `).get(sessionKey, agentId) as { count: number };
  
  const byType = enhancedDb.prepare(`
    SELECT type, COUNT(*) as count FROM enhanced_memories 
    WHERE session_key = ? AND agent_id = ?
    GROUP BY type
  `).all(sessionKey, agentId) as Array<{ type: string; count: number }>;
  
  const avgImportance = enhancedDb.prepare(`
    SELECT AVG(importance) as avg FROM enhanced_memories 
    WHERE session_key = ? AND agent_id = ?
  `).get(sessionKey, agentId) as { avg: number };
  
  return {
    total: total.count,
    byType: Object.fromEntries(byType.map(t => [t.type, t.count])),
    avgImportance: avgImportance.avg || 0
  };
}

export function closeEnhancedMemory() {
  enhancedDb?.close();
}
