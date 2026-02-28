import type { Config, AgentConfig } from "./config.js";
import { chatWithTools, type Message, type ToolDef } from "./llm.js";
import { saveMessage, getHistory, getSummaries, compactMemory, getAllKnowledge } from "./memory.js";
import { bus, type AgentMessage } from "./bus.js";
import { executeTool, getToolDefs } from "./tools.js";
import { EventEmitter } from "node:events";

const COMPACT_THRESHOLD = 60;
const MAX_TOOL_ROUNDS = 8;

export const agentEvents = new EventEmitter();

export function getDefaultAgentId(config: Config): string {
  return Object.keys(config.agents)[0] ?? "";
}

export function routeAgent(config: Config, text: string): { agentId: string; cleanText: string } {
  const match = text.match(/^@(\S+)\s*([\s\S]*)$/);
  if (match) {
    for (const [id, agent] of Object.entries(config.agents)) {
      if (agent.name === match[1] || id === match[1]) return { agentId: id, cleanText: match[2].trim() || text };
    }
  }
  return { agentId: getDefaultAgentId(config), cleanText: text };
}

function resolveModel(config: Config, modelRef: string) {
  const [modelId, ...rest] = modelRef.includes(":") ? modelRef.split(":") : [modelRef];
  const modelConfig = config.models[modelId];
  if (!modelConfig) return null;
  return { modelConfig, modelName: rest.join(":") || modelId };
}

function buildSystemPrompt(
  agentCfg: AgentConfig, agentId: string, config: Config,
  summaries: string[], knowledge: Array<{key: string; value: string}>
): string {
  let sys = agentCfg.systemPrompt;

  if (agentCfg.role === "orchestrator") {
    const agentList = Object.entries(config.agents)
      .filter(([id]) => id !== agentId)
      .map(([id, a]) => `  - ${id}: ${a.name} (${a.role}) — ${a.systemPrompt.slice(0, 50)}`)
      .join("\n");
    if (agentList) {
      sys += `\n\n你有以下子Agent可以委派任务，通过 delegate_to_agent 工具调用它们：\n${agentList}`;
    }
  }

  if (summaries.length) sys += `\n\n[历史摘要]\n${summaries.join("\n---\n")}`;
  if (knowledge.length) sys += `\n\n[已知信息]\n${knowledge.map(k => `${k.key}: ${k.value}`).join("\n")}`;
  return sys;
}

function buildDelegationTool(config: Config, agentId: string): ToolDef | null {
  const subAgents = Object.entries(config.agents).filter(([id]) => id !== agentId);
  if (!subAgents.length) return null;

  const agentEnum = subAgents.map(([id]) => id);
  return {
    type: "function",
    function: {
      name: "delegate_to_agent",
      description: `将任务委派给子Agent执行。可用的Agent: ${agentEnum.join(", ")}`,
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "string", description: `要委派的Agent ID，可选: ${agentEnum.join(", ")}`, enum: agentEnum },
          task: { type: "string", description: "要让该Agent执行的具体任务描述" },
        },
        required: ["agent_id", "task"],
      },
    },
  };
}

export async function runAgent(
  config: Config, sessionKey: string, agentId: string, userMessage: string
): Promise<string> {
  const agentCfg = config.agents[agentId];
  if (!agentCfg) return `未知Agent: ${agentId}`;
  const resolved = resolveModel(config, agentCfg.model);
  if (!resolved) return `Agent "${agentId}" 的模型配置无效`;

  saveMessage(sessionKey, agentId, "user", userMessage);

  const history = getHistory(sessionKey, agentId, 30);
  const summaries = getSummaries(agentId, 3);
  const knowledge = getAllKnowledge(agentId);
  const systemPrompt = buildSystemPrompt(agentCfg, agentId, config, summaries, knowledge);

  const toolDefs = agentCfg.tools?.length ? getToolDefs(agentCfg.tools) : [];

  // Orchestrator agents get the delegation tool
  if (agentCfg.role === "orchestrator") {
    const delegateTool = buildDelegationTool(config, agentId);
    if (delegateTool) toolDefs.push(delegateTool);
  }

  const messages: Message[] = [{ role: "system", content: systemPrompt }, ...history];

  try {
    let finalContent = "";
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await chatWithTools(resolved.modelConfig, resolved.modelName, messages, toolDefs.length ? toolDefs : undefined);

      if (!result.toolCalls.length) {
        finalContent = result.content ?? "";
        break;
      }

      const assistantMsg: any = { role: "assistant", content: result.content ?? null, tool_calls: result.toolCalls };
      messages.push(assistantMsg);

      for (const tc of result.toolCalls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch {}

        agentEvents.emit("tool_call", { agentId, tool: tc.function.name, args, round });

        let toolResult: string;

        if (tc.function.name === "delegate_to_agent") {
          // Real delegation: run the sub-agent and return its response
          const targetId = String(args.agent_id ?? "");
          const task = String(args.task ?? "");
          if (!config.agents[targetId]) {
            toolResult = `Agent "${targetId}" 不存在`;
          } else {
            toolResult = await runAgent(config, `${sessionKey}:delegate:${targetId}`, targetId, task);
          }
        } else {
          toolResult = await executeTool(tc.function.name, args);
        }

        messages.push({ role: "tool", content: toolResult, tool_call_id: tc.id });
        agentEvents.emit("tool_result", { agentId, tool: tc.function.name, result: toolResult.slice(0, 200), round });
      }

      if (round === MAX_TOOL_ROUNDS - 1) {
        const final = await chatWithTools(resolved.modelConfig, resolved.modelName, messages);
        finalContent = final.content ?? "";
      }
    }

    saveMessage(sessionKey, agentId, "assistant", finalContent);

    const total = getHistory(sessionKey, agentId, 999).length;
    if (total > COMPACT_THRESHOLD) {
      void compactMemory(agentId, sessionKey, resolved.modelConfig, resolved.modelName).catch(() => {});
    }

    return finalContent;
  } catch (err: any) {
    return `[错误] ${err.message ?? err}`;
  }
}

export async function askAgent(config: Config, agentId: string, message: string): Promise<string> {
  return runAgent(config, `__cron_${Date.now()}`, agentId, message);
}

export function listAgents(config: Config): Array<{ id: string } & AgentConfig> {
  return Object.entries(config.agents).map(([id, a]) => ({ id, ...a }));
}

export function initAgentBus(config: Config) {
  for (const [id] of Object.entries(config.agents)) {
    bus.subscribe(id, async (msg: AgentMessage) => {
      if (msg.type === "task" && typeof msg.payload === "string") {
        const reply = await runAgent(config, `bus:${msg.from}`, id, msg.payload);
        bus.send({ from: id, to: msg.from, type: "result", payload: reply });
      }
    });
  }
}
