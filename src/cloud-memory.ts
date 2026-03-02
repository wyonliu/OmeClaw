/**
 * 终身记忆系统 - 云端存储和同步
 * 目标：让记忆永不丢失，跨设备无缝同步
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface MemoryEntry {
  id: string;
  sessionId: string;
  agentId: string;
  timestamp: number;
  type: "fact" | "conversation" | "event" | "milestone";
  content: string;
  metadata: Record<string, any>;
  tags: string[];
  importance: number; // 1-10
  synced: boolean;
}

export interface MemoryTimeline {
  entries: MemoryEntry[];
  totalCount: number;
  oldestTimestamp: number;
  newestTimestamp: number;
}

export class CloudMemorySystem {
  private storageDir: string;
  private memoryIndex: Map<string, MemoryEntry> = new Map();
  private syncQueue: MemoryEntry[] = [];

  constructor(baseDir: string) {
    this.storageDir = join(baseDir, "cloud-memory");
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
    this.loadMemoryIndex();
  }

  /**
   * 保存记忆条目
   */
  saveMemory(entry: Omit<MemoryEntry, "id" | "timestamp" | "synced">): string {
    const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const memoryEntry: MemoryEntry = {
      ...entry,
      id,
      timestamp: Date.now(),
      synced: false,
    };

    this.memoryIndex.set(id, memoryEntry);
    this.syncQueue.push(memoryEntry);
    this.persistMemory(memoryEntry);

    return id;
  }

  /**
   * 搜索记忆
   */
  searchMemory(query: string, options?: {
    sessionId?: string;
    agentId?: string;
    type?: MemoryEntry["type"];
    startTime?: number;
    endTime?: number;
    minImportance?: number;
    tags?: string[];
    limit?: number;
  }): MemoryEntry[] {
    let results = Array.from(this.memoryIndex.values());

    // 过滤条件
    if (options?.sessionId) {
      results = results.filter(m => m.sessionId === options.sessionId);
    }
    if (options?.agentId) {
      results = results.filter(m => m.agentId === options.agentId);
    }
    if (options?.type) {
      results = results.filter(m => m.type === options.type);
    }
    if (options?.startTime) {
      results = results.filter(m => m.timestamp >= options.startTime!);
    }
    if (options?.endTime) {
      results = results.filter(m => m.timestamp <= options.endTime!);
    }
    if (options?.minImportance) {
      results = results.filter(m => m.importance >= options.minImportance!);
    }
    if (options?.tags && options.tags.length > 0) {
      results = results.filter(m => 
        options.tags!.some(tag => m.tags.includes(tag))
      );
    }

    // 文本搜索
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(m => 
        m.content.toLowerCase().includes(lowerQuery) ||
        m.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    }

    // 按重要性和时间排序
    results.sort((a, b) => {
      if (a.importance !== b.importance) {
        return b.importance - a.importance;
      }
      return b.timestamp - a.timestamp;
    });

    // 限制结果数量
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * 获取记忆时光机（按时间线展示）
   */
  getMemoryTimeline(sessionId: string, options?: {
    startTime?: number;
    endTime?: number;
    groupBy?: "day" | "week" | "month" | "year";
  }): Record<string, MemoryEntry[]> {
    const memories = this.searchMemory("", { 
      sessionId,
      startTime: options?.startTime,
      endTime: options?.endTime,
    });

    const timeline: Record<string, MemoryEntry[]> = {};
    const groupBy = options?.groupBy || "day";

    memories.forEach(memory => {
      const date = new Date(memory.timestamp);
      let key: string;

      switch (groupBy) {
        case "day":
          key = date.toISOString().split("T")[0];
          break;
        case "week":
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split("T")[0];
          break;
        case "month":
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          break;
        case "year":
          key = String(date.getFullYear());
          break;
      }

      if (!timeline[key]) {
        timeline[key] = [];
      }
      timeline[key].push(memory);
    });

    return timeline;
  }

  /**
   * 导出记忆
   */
  exportMemory(sessionId: string, format: "json" | "markdown" | "csv"): string {
    const memories = this.searchMemory("", { sessionId });

    switch (format) {
      case "json":
        return JSON.stringify(memories, null, 2);

      case "markdown":
        let md = `# 记忆导出\n\n`;
        md += `导出时间: ${new Date().toLocaleString()}\n`;
        md += `总记忆数: ${memories.length}\n\n`;
        
        const timeline = this.getMemoryTimeline(sessionId);
        Object.entries(timeline).forEach(([date, entries]) => {
          md += `## ${date}\n\n`;
          entries.forEach(entry => {
            md += `### ${entry.type} - ${new Date(entry.timestamp).toLocaleTimeString()}\n`;
            md += `${entry.content}\n`;
            if (entry.tags.length > 0) {
              md += `标签: ${entry.tags.join(", ")}\n`;
            }
            md += `\n`;
          });
        });
        return md;

      case "csv":
        let csv = "ID,时间,类型,内容,标签,重要性\n";
        memories.forEach(m => {
          csv += `"${m.id}","${new Date(m.timestamp).toISOString()}","${m.type}","${m.content.replace(/"/g, '""')}","${m.tags.join(";")}",${m.importance}\n`;
        });
        return csv;

      default:
        return JSON.stringify(memories);
    }
  }

  /**
   * 导入记忆
   */
  importMemory(data: string, _format: "json"): number {
    try {
      const memories: MemoryEntry[] = JSON.parse(data);
      let imported = 0;

      memories.forEach(memory => {
        if (!this.memoryIndex.has(memory.id)) {
          this.memoryIndex.set(memory.id, memory);
          this.persistMemory(memory);
          imported++;
        }
      });

      return imported;
    } catch (e) {
      console.error("导入记忆失败:", e);
      return 0;
    }
  }

  /**
   * 获取记忆统计
   */
  getMemoryStats(sessionId: string): {
    totalCount: number;
    byType: Record<string, number>;
    byImportance: Record<number, number>;
    oldestTimestamp: number;
    newestTimestamp: number;
    totalSize: number;
  } {
    const memories = this.searchMemory("", { sessionId });

    const stats = {
      totalCount: memories.length,
      byType: {} as Record<string, number>,
      byImportance: {} as Record<number, number>,
      oldestTimestamp: memories.length > 0 ? memories[memories.length - 1].timestamp : 0,
      newestTimestamp: memories.length > 0 ? memories[0].timestamp : 0,
      totalSize: 0,
    };

    memories.forEach(m => {
      stats.byType[m.type] = (stats.byType[m.type] || 0) + 1;
      stats.byImportance[m.importance] = (stats.byImportance[m.importance] || 0) + 1;
      stats.totalSize += JSON.stringify(m).length;
    });

    return stats;
  }

  /**
   * 持久化记忆
   */
  private persistMemory(entry: MemoryEntry): void {
    const filePath = join(this.storageDir, `${entry.id}.json`);
    writeFileSync(filePath, JSON.stringify(entry, null, 2));
  }

  /**
   * 加载记忆索引
   */
  private loadMemoryIndex(): void {
    if (!existsSync(this.storageDir)) return;

    const files = require("fs").readdirSync(this.storageDir);
    files.forEach((file: string) => {
      if (file.endsWith(".json")) {
        try {
          const filePath = join(this.storageDir, file);
          const data = readFileSync(filePath, "utf-8");
          const entry: MemoryEntry = JSON.parse(data);
          this.memoryIndex.set(entry.id, entry);
        } catch (e) {
          console.error(`加载记忆文件失败: ${file}`, e);
        }
      }
    });

    console.log(`✅ 加载了 ${this.memoryIndex.size} 条记忆`);
  }

  /**
   * 同步到云端（模拟）
   */
  async syncToCloud(): Promise<number> {
    const toSync = this.syncQueue.splice(0);
    
    // 这里应该调用云端API
    // 现在只是模拟
    toSync.forEach(entry => {
      entry.synced = true;
      this.persistMemory(entry);
    });

    return toSync.length;
  }
}

// 全局实例
let cloudMemoryInstance: CloudMemorySystem | null = null;

export function getCloudMemory(baseDir: string): CloudMemorySystem {
  if (!cloudMemoryInstance) {
    cloudMemoryInstance = new CloudMemorySystem(baseDir);
  }
  return cloudMemoryInstance;
}
