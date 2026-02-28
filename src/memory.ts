import Database from "better-sqlite3";
import { resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { chat, type Message } from "./llm.js";
import type { ModelConfig } from "./config.js";

let db: Database.Database;

export function initMemory(dataDir: string) {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  db = new Database(resolve(dataDir, "memory.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_msg_session ON messages(session_key, agent_id);
    CREATE INDEX IF NOT EXISTS idx_msg_time ON messages(created_at);

    CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      embedding TEXT,
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_know_key ON knowledge(key);
  `);
}

export function saveMessage(sessionKey: string, agentId: string, role: string, content: string) {
  db.prepare("INSERT INTO messages (session_key, agent_id, role, content) VALUES (?, ?, ?, ?)").run(sessionKey, agentId, role, content);
}

export function getHistory(sessionKey: string, agentId: string, limit = 50): Message[] {
  const rows = db.prepare(
    "SELECT role, content FROM messages WHERE session_key = ? AND agent_id = ? ORDER BY id DESC LIMIT ?"
  ).all(sessionKey, agentId, limit) as Array<{ role: string; content: string }>;
  return rows.reverse().map(r => ({ role: r.role as Message["role"], content: r.content }));
}

export function searchMemory(query: string, agentId?: string, limit = 10): Array<{ role: string; content: string; created_at: number }> {
  const sql = agentId
    ? "SELECT role, content, created_at FROM messages WHERE agent_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT ?"
    : "SELECT role, content, created_at FROM messages WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?";
  const args = agentId ? [agentId, `%${query}%`, limit] : [`%${query}%`, limit];
  return db.prepare(sql).all(...args) as any[];
}

export function saveKnowledge(agentId: string, key: string, value: string) {
  const existing = db.prepare("SELECT id FROM knowledge WHERE agent_id = ? AND key = ?").get(agentId, key);
  if (existing) {
    db.prepare("UPDATE knowledge SET value = ?, updated_at = unixepoch() WHERE agent_id = ? AND key = ?").run(value, agentId, key);
  } else {
    db.prepare("INSERT INTO knowledge (agent_id, key, value) VALUES (?, ?, ?)").run(agentId, key, value);
  }
}

export function getKnowledge(agentId: string, key: string): string | null {
  const row = db.prepare("SELECT value FROM knowledge WHERE agent_id = ? AND key = ?").get(agentId, key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getAllKnowledge(agentId: string): Array<{ key: string; value: string }> {
  return db.prepare("SELECT key, value FROM knowledge WHERE agent_id = ? ORDER BY updated_at DESC").all(agentId) as any[];
}

export async function compactMemory(
  agentId: string,
  sessionKey: string,
  modelConfig: ModelConfig,
  modelName: string,
  keepRecent = 20
): Promise<void> {
  const allMsgs = db.prepare(
    "SELECT id, role, content FROM messages WHERE session_key = ? AND agent_id = ? ORDER BY id ASC"
  ).all(sessionKey, agentId) as Array<{ id: number; role: string; content: string }>;

  if (allMsgs.length <= keepRecent * 2) return;

  const toCompact = allMsgs.slice(0, allMsgs.length - keepRecent);
  const text = toCompact.map(m => `${m.role}: ${m.content}`).join("\n");

  const summary = await chat(modelConfig, modelName, [
    { role: "system", content: "Summarize this conversation into key facts, decisions, and context. Be concise but preserve all important information. Output in the same language as the conversation." },
    { role: "user", content: text },
  ]);

  db.prepare("INSERT INTO summaries (agent_id, scope, content) VALUES (?, ?, ?)").run(agentId, sessionKey, summary);

  const ids = toCompact.map(m => m.id);
  db.prepare(`DELETE FROM messages WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
}

export function getSummaries(agentId: string, limit = 5): string[] {
  const rows = db.prepare("SELECT content FROM summaries WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?").all(agentId, limit) as Array<{ content: string }>;
  return rows.map(r => r.content);
}

export function getMessageCount(agentId?: string): number {
  if (agentId) {
    return (db.prepare("SELECT COUNT(*) as c FROM messages WHERE agent_id = ?").get(agentId) as any).c;
  }
  return (db.prepare("SELECT COUNT(*) as c FROM messages").get() as any).c;
}

export function getRecentMessages(limit = 50): Array<{ session_key: string; agent_id: string; role: string; content: string; created_at: number }> {
  return db.prepare(
    "SELECT session_key, agent_id, role, content, created_at FROM messages ORDER BY id DESC LIMIT ?"
  ).all(limit) as any[];
}

export function getHistoryForSession(sessionKey: string, agentId?: string, limit = 50): Array<{ role: string; content: string; agent_id: string; created_at: number }> {
  const sql = agentId
    ? "SELECT role, content, agent_id, created_at FROM messages WHERE session_key = ? AND agent_id = ? ORDER BY id ASC LIMIT ?"
    : "SELECT role, content, agent_id, created_at FROM messages WHERE session_key = ? ORDER BY id ASC LIMIT ?";
  const args = agentId ? [sessionKey, agentId, limit] : [sessionKey, limit];
  return db.prepare(sql).all(...args) as any[];
}

const USER_FACTS_PREFIX = "user:";
export function getUserFacts(sessionKey: string): Array<{ key: string; value: string }> {
  const scope = USER_FACTS_PREFIX + sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return db.prepare("SELECT key, value FROM knowledge WHERE agent_id = ? ORDER BY updated_at DESC").all(scope) as any[];
}
export function saveUserFact(sessionKey: string, key: string, value: string) {
  const scope = USER_FACTS_PREFIX + sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const existing = db.prepare("SELECT id FROM knowledge WHERE agent_id = ? AND key = ?").get(scope, key);
  if (existing) {
    db.prepare("UPDATE knowledge SET value = ?, updated_at = unixepoch() WHERE agent_id = ? AND key = ?").run(value, scope, key);
  } else {
    db.prepare("INSERT INTO knowledge (agent_id, key, value) VALUES (?, ?, ?)").run(scope, key, value);
  }
}

export function getRecentConversations(limit = 30): Array<{ session_key: string; role: string; content: string; agent_id: string; created_at: number }> {
  return db.prepare(
    "SELECT session_key, role, content, agent_id, created_at FROM messages ORDER BY id DESC LIMIT ?"
  ).all(limit) as any[];
}

export function closeMemory() {
  db?.close();
}
