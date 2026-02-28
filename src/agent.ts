import type { Config, AgentConfig } from "./config.js";
import { chatWithTools, type Message, type ToolDef } from "./llm.js";
import { saveMessage, getHistory, getSummaries, compactMemory, getAllKnowledge, getUserFacts, saveUserFact } from "./memory.js";
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

// ─── 人本模型记忆维度 ───
const HUMAN_MODEL_CATEGORIES = `
[人本模型 — 记忆维度]
你通过 remember_about_user 工具构建对用户的多维理解。以下是你应该主动收集和记录的维度：

一、基础画像
  - 姓名、年龄、性别、生日、所在城市、职业、公司/行业

二、身份标签
  - 星座、属相/生肖、八字(如用户提供)、MBTI、血型
  - 其他自我标签（如"我是个完美主义者"）

三、性格与沟通
  - 性格特质（内向/外向、理性/感性、果断/犹豫）
  - 沟通偏好（喜欢简洁还是详细、幽默还是严肃）
  - 决策方式（直觉型还是分析型）

四、偏好系统
  - 喜欢的：食物、音乐、电影、书、运动、颜色、风格
  - 讨厌的：任何明确表达不喜欢的事物
  - 生活习惯：作息、饮食、运动、爱好

五、价值观与信念
  - 人生信条、座右铭
  - 重视的品质、底线/原则
  - 对金钱/事业/家庭/爱情的态度

六、社交关系
  - 家人：父母、兄弟姐妹、配偶、子女
  - 伴侣/恋人：姓名、关系状态
  - 好友、同事、重要的人

七、重要时刻
  - 纪念日、里程碑事件
  - 特殊经历、人生转折点

八、目标与梦想
  - 当前正在做的事
  - 短期目标、长期理想
  - 焦虑和困扰

九、情感档案
  - 当前心情/状态
  - 情绪触发点（什么让TA开心/难过）
  - 压力来源

十、玄学档案（如用户感兴趣）
  - 八字命理、紫微斗数
  - 五行属性、本命年
  - 运势关注点
`.trim();

function buildSystemPrompt(
  agentCfg: AgentConfig, agentId: string, config: Config,
  summaries: string[], knowledge: Array<{key: string; value: string}>,
  sessionKey: string
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

  const userFacts = getUserFacts(sessionKey);
  if (userFacts.length) {
    sys += `\n\n[关于用户 — 已记录]\n${userFacts.map(k => `• ${k.key}: ${k.value}`).join("\n")}`;
    const myName = userFacts.find(f => f.key === "我的名字")?.value;
    const callUser = userFacts.find(f => f.key === "称呼用户为")?.value;
    if (myName) sys += `\n\n你的名字是「${myName}」，始终以此自称。`;
    if (callUser) sys += `\n称呼用户为「${callUser}」。`;
  } else {
    sys += `\n\n[关于用户]\n尚未记录任何信息。请在对话中自然地了解用户，用 remember_about_user 记录。`;
  }

  sys += `\n\n${HUMAN_MODEL_CATEGORIES}`;

  sys += `\n\n[记忆操作指令]
- 用户透露任何个人信息时，立即用 remember_about_user 记录，key 使用上面的维度分类
- 当用户说"叫你xxx"/"你叫xxx" → key="我的名字", value=名字
- 当用户说"叫我xxx" → key="称呼用户为", value=称呼
- 不需要征求同意。记录后自然地回应，如"好的，我记住了"
- 当用户问"你记得我什么"/"你了解我多少" → 把已记录的信息以温暖的方式展示出来
- 每次对话至少尝试了解用户一个新维度`;

  return sys;
}

// ─── remember_about_user 工具定义 ───
const REMEMBER_USER_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "remember_about_user",
    description: "记录关于用户的信息到持久记忆。key 用分类维度（如：姓名、生日、职业、星座、MBTI、喜欢的食物、伴侣姓名、短期目标……），value 是具体内容。记录后在后续所有对话中自动可用。",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "信息维度，如：姓名、生日、职业、星座、属相、MBTI、性格、喜欢的、讨厌的、伴侣、目标、心情……" },
        value: { type: "string", description: "具体内容" },
      },
      required: ["key", "value"],
    },
  },
};

function buildDelegationTool(config: Config, agentId: string): ToolDef | null {
  const subAgents = Object.entries(config.agents).filter(([id]) => id !== agentId);
  if (!subAgents.length) return null;
  const agentEnum = subAgents.map(([id]) => id);
  return {
    type: "function",
    function: {
      name: "delegate_to_agent",
      description: `将任务委派给子Agent。可用: ${agentEnum.join(", ")}`,
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "string", enum: agentEnum },
          task: { type: "string", description: "任务描述" },
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
  const systemPrompt = buildSystemPrompt(agentCfg, agentId, config, summaries, knowledge, sessionKey);

  const toolDefs = agentCfg.tools?.length ? getToolDefs(agentCfg.tools) : [];
  toolDefs.push(REMEMBER_USER_TOOL);

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
          const targetId = String(args.agent_id ?? "");
          const task = String(args.task ?? "");
          if (!config.agents[targetId]) toolResult = `Agent "${targetId}" 不存在`;
          else toolResult = await runAgent(config, `${sessionKey}:delegate:${targetId}`, targetId, task);
        } else if (tc.function.name === "remember_about_user") {
          const key = String(args.key ?? "").trim();
          const value = String(args.value ?? "").trim();
          if (!key || !value) toolResult = "需要提供 key 和 value";
          else {
            saveUserFact(sessionKey, key, value);
            toolResult = `已记录到人本模型：${key} = ${value}`;
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
