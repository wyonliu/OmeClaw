// 向量记忆搜索系统
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

interface VectorMemory {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    type: "message" | "fact" | "event";
    timestamp: number;
    agentId?: string;
    sessionId?: string;
    key?: string;
    value?: string;
  };
}

let dataDir = ".omeclaw";
let memories: VectorMemory[] = [];
let embeddingCache = new Map<string, number[]>();

// 简单的文本向量化（使用字符频率和 n-gram）
function simpleEmbedding(text: string): number[] {
  const normalized = text.toLowerCase().trim();
  const vector = new Array(128).fill(0);
  
  // 字符频率
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    vector[code % 64] += 1;
  }
  
  // 2-gram
  for (let i = 0; i < normalized.length - 1; i++) {
    const code1 = normalized.charCodeAt(i);
    const code2 = normalized.charCodeAt(i + 1);
    vector[64 + ((code1 + code2) % 64)] += 1;
  }
  
  // 归一化
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude;
    }
  }
  
  return vector;
}

// 余弦相似度
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

export function initVectorMemory(dir: string) {
  dataDir = dir;
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  
  const vectorFile = resolve(dataDir, "vectors.json");
  if (existsSync(vectorFile)) {
    try {
      const data = JSON.parse(readFileSync(vectorFile, "utf-8"));
      memories = data.memories || [];
    } catch (e) {
      console.warn("[vector] Failed to load vectors:", e);
    }
  }
}

function saveVectors() {
  const vectorFile = resolve(dataDir, "vectors.json");
  writeFileSync(vectorFile, JSON.stringify({ memories }, null, 2), "utf-8");
}

export function addVectorMemory(
  text: string,
  type: "message" | "fact" | "event",
  metadata: Partial<VectorMemory["metadata"]> = {}
) {
  const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  
  // 检查缓存
  let embedding = embeddingCache.get(text);
  if (!embedding) {
    embedding = simpleEmbedding(text);
    embeddingCache.set(text, embedding);
  }
  
  const memory: VectorMemory = {
    id,
    text,
    embedding,
    metadata: {
      type,
      timestamp: Date.now(),
      ...metadata,
    },
  };
  
  memories.push(memory);
  
  // 限制内存大小
  if (memories.length > 10000) {
    memories = memories.slice(-5000);
  }
  
  saveVectors();
  return id;
}

export function searchVectorMemory(
  query: string,
  options: {
    limit?: number;
    type?: "message" | "fact" | "event";
    minSimilarity?: number;
    sessionId?: string;
    agentId?: string;
  } = {}
): Array<{ memory: VectorMemory; similarity: number }> {
  const {
    limit = 10,
    type,
    minSimilarity = 0.3,
    sessionId,
    agentId,
  } = options;
  
  // 生成查询向量
  let queryEmbedding = embeddingCache.get(query);
  if (!queryEmbedding) {
    queryEmbedding = simpleEmbedding(query);
    embeddingCache.set(query, queryEmbedding);
  }
  
  // 计算相似度
  const results = memories
    .filter(m => {
      if (type && m.metadata.type !== type) return false;
      if (sessionId && m.metadata.sessionId !== sessionId) return false;
      if (agentId && m.metadata.agentId !== agentId) return false;
      return true;
    })
    .map(memory => ({
      memory,
      similarity: cosineSimilarity(queryEmbedding!, memory.embedding),
    }))
    .filter(r => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  
  return results;
}

export function getVectorMemoryStats() {
  const byType = {
    message: memories.filter(m => m.metadata.type === "message").length,
    fact: memories.filter(m => m.metadata.type === "fact").length,
    event: memories.filter(m => m.metadata.type === "event").length,
  };
  
  return {
    total: memories.length,
    byType,
    cacheSize: embeddingCache.size,
  };
}

export function clearVectorMemory() {
  memories = [];
  embeddingCache.clear();
  saveVectors();
}

// 批量导入现有记忆
export function importExistingMemories(
  messages: Array<{ role: string; content: string; sessionId?: string; agentId?: string }>,
  facts: Array<{ key: string; value: string }>
) {
  let imported = 0;
  
  // 导入消息
  for (const msg of messages) {
    if (msg.role === "user" || msg.role === "assistant") {
      addVectorMemory(msg.content, "message", {
        sessionId: msg.sessionId,
        agentId: msg.agentId,
      });
      imported++;
    }
  }
  
  // 导入事实
  for (const fact of facts) {
    addVectorMemory(`${fact.key}: ${fact.value}`, "fact", {
      key: fact.key,
      value: fact.value,
    });
    imported++;
  }
  
  return imported;
}
