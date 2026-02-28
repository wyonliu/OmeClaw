import { EventEmitter } from "node:events";

export interface AgentMessage {
  from: string;
  to: string;
  type: "task" | "result" | "query" | "notify" | "broadcast";
  payload: unknown;
  timestamp: number;
  id: string;
}

type Handler = (msg: AgentMessage) => void | Promise<void>;

class AgentBus extends EventEmitter {
  private handlers = new Map<string, Handler[]>();
  private log: AgentMessage[] = [];

  send(msg: Omit<AgentMessage, "timestamp" | "id">) {
    const full: AgentMessage = {
      ...msg,
      timestamp: Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    this.log.push(full);
    if (this.log.length > 10000) this.log = this.log.slice(-5000);

    if (full.to === "*") {
      for (const [, handlers] of this.handlers) {
        for (const h of handlers) void h(full);
      }
    } else {
      const handlers = this.handlers.get(full.to);
      if (handlers) for (const h of handlers) void h(full);
    }

    this.emit("message", full);
    return full;
  }

  subscribe(agentId: string, handler: Handler) {
    const list = this.handlers.get(agentId) ?? [];
    list.push(handler);
    this.handlers.set(agentId, list);
  }

  unsubscribe(agentId: string) {
    this.handlers.delete(agentId);
  }

  history(agentId?: string, limit = 50): AgentMessage[] {
    const msgs = agentId
      ? this.log.filter(m => m.from === agentId || m.to === agentId || m.to === "*")
      : this.log;
    return msgs.slice(-limit);
  }

  activeAgents(): string[] {
    return [...this.handlers.keys()];
  }
}

export const bus = new AgentBus();
