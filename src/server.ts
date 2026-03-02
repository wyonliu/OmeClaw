import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { listAgents, routeAgent, runAgent, initAgentBus, agentEvents, startHeartbeat, getReminders, getAgentRuntimeStates, createAgentDefinition } from "./agent.js";
import { initMemory, getMessageCount, searchMemory, getRecentMessages, getHistoryForSession, getMergedHistory, getUserFacts, getUserFactCount, getMessagesSince, saveUserFact, saveMessage } from "./memory.js";
import { initGamification, addXP, trackMessage, trackFact, trackToolUse, getProgress, getAllAchievements, getAllLevels, unlockAchievement } from "./gamification.js";
import { initVectorMemory, addVectorMemory, searchVectorMemory, getVectorMemoryStats, importExistingMemories } from "./vector.js";
import { handleWebSocketUpgrade, pushEvent, getWSStats } from "./websocket.js";
import { initOmeLand, upsertAgentProfile, createPost, followAgent, likePost, getFeed, getAgentProfile, getAllAgents, getAgentPosts, matchAgents, getOmeLandStats } from "./omeland.js";
import { bus } from "./bus.js";
import { listTools } from "./tools.js";
import { createLarkAdapter } from "./gateway/lark.js";
import { createTelegramAdapter } from "./gateway/telegram.js";
import { createDiscordAdapter } from "./gateway/discord.js";
import { registerGateway, allGateways, getGateway, type GatewayMessage } from "./gateway/base.js";
import { startScheduler } from "./scheduler.js";

const __dir = resolve(fileURLToPath(import.meta.url), "../..");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
};

interface ActivityLog { time: number; type: string; agent: string; detail: string; source?: string; thread?: string }
const activityLog: ActivityLog[] = [];

interface EvolutionEvent { time: number; type: string; detail: string; emoji: string }
const evolutionLog: EvolutionEvent[] = [];
function logEvolution(type: string, detail: string, emoji: string) {
  evolutionLog.push({ time: Date.now(), type, detail, emoji });
  if (evolutionLog.length > 200) evolutionLog.splice(0, 100);
}

let larkLogChatId = "";
function logActivity(type: string, agent: string, detail: string, source?: string, thread?: string) {
  activityLog.push({ time: Date.now(), type, agent, detail, source, thread });
  if (activityLog.length > 1000) activityLog.splice(0, 500);
}

export function setLarkLogChat(chatId: string) { larkLogChatId = chatId; }
export function pushSystemLog(text: string) {
  logActivity("system", "server", text);
  if (larkLogChatId) {
    const lark = getGateway("lark");
    if (lark) void lark.sendMessage(larkLogChatId, `[系统] ${text}`).catch(() => {});
  }
}

export { logActivity, activityLog };

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}
function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => { let b = ""; req.on("data", c => b += c); req.on("end", () => ok(b)); req.on("error", fail); });
}

export function startServer(config: Config, port: number, configPath?: string) {
  const dataDir = resolve(process.cwd(), config.memory?.dataDir ?? ".omeclaw");
  initMemory(dataDir);
  initGamification(dataDir);
  initVectorMemory(dataDir);
  initOmeLand(dataDir);
  initAgentBus(config);
  
  // 导入现有记忆到向量系统
  setTimeout(() => {
    const messages = getRecentMessages(1000);
    const facts = getUserFacts();
    const imported = importExistingMemories(messages, facts);
    console.log(`[vector] Imported ${imported} existing memories`);
    
    // 自动创建主 Agent 档案
    const orchAgent = Object.entries(config.agents).find(([_, a]) => a.role === "orchestrator");
    if (orchAgent) {
      const [agentId, agentConfig] = orchAgent;
      const userFacts = getUserFacts();
      const mbti = userFacts.find(f => f.key === "MBTI")?.value;
      const traits = userFacts.find(f => f.key === "性格特质")?.value?.split("、") || [];
      const interests = userFacts.find(f => f.key === "兴趣爱好")?.value?.split("、") || [];
      
      upsertAgentProfile({
        id: agentId,
        name: agentConfig.name,
        avatar: "🪼",
        bio: agentConfig.systemPrompt?.slice(0, 100) || "你的 AI 分身",
        personality: {
          mbti,
          traits,
          interests,
        },
      });
      console.log(`[omeland] Created profile for ${agentConfig.name}`);
    }
  }, 2000);

  agentEvents.on("tool_call", (d: any) => {
    logActivity("tool", d.agentId, `🔧 ${d.tool}(${JSON.stringify(d.args).slice(0, 80)})`);
    trackToolUse(d.tool);
    
    // 实时推送工具调用事件
    pushEvent({
      type: "tool_call",
      data: { agentId: d.agentId, tool: d.tool, args: d.args },
      sessionId: OWNER_SESSION,
    });
    
    if (d.tool === "remember_about_user") {
      logActivity("memory", d.agentId, `🧠 记忆写入: ${d.args?.key} = ${d.args?.value}`.slice(0, 120));
      logEvolution("memory", `记忆生长 · ${d.args?.key}`, "🧠");
      trackFact(getUserFactCount());
      addXP(5, "fact_created");
      // 添加到向量记忆
      addVectorMemory(`${d.args?.key}: ${d.args?.value}`, "fact", {
        key: d.args?.key,
        value: d.args?.value,
        agentId: d.agentId,
      });
      
      // 实时推送记忆更新
      pushEvent({
        type: "memory_update",
        data: { key: d.args?.key, value: d.args?.value, factCount: getUserFactCount() },
        sessionId: OWNER_SESSION,
      });
    }
  });
  agentEvents.on("tool_result", (d: any) => logActivity("tool_result", d.agentId, `✅ ${d.tool} → ${d.result.slice(0, 100)}`));
  agentEvents.on("agent_created", async (d: any) => {
    logActivity("agent_created", d.id, `🧬 新分身体唤醒: ${d.name} [${d.role}]`);
    logEvolution("agent", `分身体「${d.name}」觉醒`, "🧬");
    if (configPath && existsSync(configPath) && config.agents[d.id]) {
      try {
        const { parse: parseYaml, stringify: stringifyYaml } = await import("yaml");
        const raw = readFileSync(configPath, "utf-8");
        const parsed = parseYaml(raw) || {};
        if (!parsed.agents) parsed.agents = {};
        const a = config.agents[d.id];
        parsed.agents[d.id] = { name: a.name, model: a.model, systemPrompt: a.systemPrompt, role: a.role, tools: a.tools || [] };
        writeFileSync(configPath, stringifyYaml(parsed, { lineWidth: 0 }), "utf-8");
        console.log(`[server] Agent "${d.id}" persisted to config`);
      } catch (e: any) { console.warn("[server] Failed to persist agent:", e.message); }
    }
  });

  const OWNER_SESSION = "owner";
  const onMessage = async (msg: GatewayMessage) => {
    logActivity("user_in", msg.gateway, `${msg.text.slice(0, 120)}`, msg.gateway, msg.chatId || msg.senderId);
    const { agentId, cleanText } = routeAgent(config, msg.text);
    const reply = await runAgent(config, OWNER_SESSION, agentId, cleanText);
    logActivity("agent_out", agentId, reply.slice(0, 150), msg.gateway, msg.chatId || msg.senderId);
    return reply;
  };

  const lark = createLarkAdapter(config, onMessage);
  if (lark) { registerGateway(lark); lark.init(); }
  const tg = createTelegramAdapter(config, onMessage);
  if (tg) { registerGateway(tg); tg.init(); }
  const dc = createDiscordAdapter(config, onMessage);
  if (dc) { registerGateway(dc); dc.init(); }

  startScheduler(config);
  startHeartbeat(config, 3600_000);

  // ─── 主动触达系统 ───
  let lastProactiveHour = -1;
  setInterval(async () => {
    const h = new Date().getHours();
    if (h === lastProactiveHour) return;
    const facts = getUserFacts();
    if (facts.length < 2) return;
    const callUser = facts.find(f => f.key === "称呼用户为")?.value ?? "";
    const orchId = Object.entries(config.agents).find(([_, a]) => a.role === "orchestrator")?.[0];
    if (!orchId) return;

    let proactiveMsg = "";
    if (h === 8) { proactiveMsg = callUser ? `${callUser}，早安~ 新的一天，有什么计划吗？` : "早安~ 新的一天开始了 ☀️"; }
    else if (h === 22) { proactiveMsg = callUser ? `${callUser}，今天辛苦了~ 早点休息哦 🌙` : "夜深了，早点休息 🌙"; }
    else if (h === 14) {
      const prompts = ["下午了，喝杯水吧~ 💧","下午好，工作顺利吗？","困了吧？站起来活动活动~"];
      proactiveMsg = prompts[Math.floor(Math.random() * prompts.length)];
    }

    if (proactiveMsg) {
      lastProactiveHour = h;
      saveMessage(OWNER_SESSION, orchId, "assistant", proactiveMsg);
      logActivity("agent_out", orchId, `💌 主动触达: ${proactiveMsg}`, "system");
      logEvolution("proactive", `主动关心 · ${proactiveMsg.slice(0, 30)}`, "💌");
      for (const gw of allGateways()) {
        try { await gw.broadcast?.(proactiveMsg); } catch {}
      }
    }
  }, 300_000);

  // 提醒到时回调：发给用户
  agentEvents.on("reminder", async (d: { id: string; message: string; agentId: string }) => {
    const text = `⏰ 提醒: ${d.message}`;
    logActivity("system", d.agentId, text);
    logEvolution("reminder", `提醒触发 · ${d.message}`, "⏰");
    // 通过所有网关推送
    for (const gw of allGateways()) {
      try { await gw.broadcast?.(text); } catch {}
    }
  });

  // 自进化心跳洞察
  agentEvents.on("evolution", (d: { type: string; detail: string; emoji: string }) => {
    logEvolution(d.type, d.detail, d.emoji);
    logActivity("system", "heartbeat", `💡 进化洞察: ${d.detail}`);
  });

  const webDir = existsSync(resolve(__dir, "web")) ? resolve(__dir, "web") : resolve(process.cwd(), "web");

  const server = createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    const fullUrl = req.url ?? "/";
    const method = req.method ?? "GET";
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    // Gateway webhooks first
    for (const gw of allGateways()) {
      if (gw.handleWebhook) { const h = await gw.handleWebhook(req, res); if (h) return; }
    }

    // --- API Routes ---

    if (url === "/api/status" && method === "GET") {
      const runtime = getAgentRuntimeStates();
      return json(res, {
        status: "running", version: "0.6.0", uptime: process.uptime(),
        agents: listAgents(config).map(a => ({ id: a.id, name: a.name, role: a.role })),
        agentRuntime: runtime,
        gateways: allGateways().map(g => g.name),
        tools: listTools().map(t => t.name),
        memory: { messages: getMessageCount() },
        reminders: { count: getReminders().length, active: getReminders().slice(0, 20) },
        busAgents: bus.activeAgents(),
        scheduler: config.scheduler?.enabled ? { jobs: config.scheduler.jobs.length } : null,
      });
    }

    if (url === "/api/pm/audit" && method === "GET") {
      const allAgents = listAgents(config);
      const runtime = getAgentRuntimeStates();
      const factCount = getUserFactCount();
      const facts = getUserFacts();
      const checks = [
        {
          id: "agent_count_consistency",
          title: "Agent 数量一致性",
          ok: allAgents.length >= 1 && runtime.length <= allAgents.length,
          detail: `配置 ${allAgents.length} 个 / 运行态 ${runtime.length} 个`,
        },
        {
          id: "cross_end_memory",
          title: "跨端记忆最小可用",
          ok: factCount > 0,
          detail: factCount > 0 ? `已存 ${factCount} 条用户事实` : "暂无用户事实，请先完成首次引导",
        },
        {
          id: "gateway_online",
          title: "网关在线",
          ok: allGateways().length > 0,
          detail: allGateways().length ? `已启用：${allGateways().map(g => g.name).join(", ")}` : "仅 Web 入口",
        },
        {
          id: "memory_density",
          title: "记忆密度",
          ok: facts.length >= 8,
          detail: facts.length >= 8 ? "记忆密度达标" : `当前 ${facts.length} 条，建议继续补充用户画像`,
        },
      ];
      return json(res, {
        generatedAt: Date.now(),
        score: checks.filter(c => c.ok).length,
        total: checks.length,
        checks,
      });
    }

    // Agent creation (POST must come before GET)
    if (url === "/api/agents" && method === "POST") {
      try {
        const body = JSON.parse(await collectBody(req));
        const { id, name, model, systemPrompt, role, tools } = body;
        if (!id || !name || !model) return json(res, { error: "id, name, model required" }, 400);
        const created = createAgentDefinition(config, {
          id: String(id),
          name: String(name),
          model: String(model),
          systemPrompt: String(systemPrompt || "You are a helpful assistant."),
          role: String(role || "worker"),
          tools: Array.isArray(tools) ? tools.map((x: any) => String(x)) : [],
        });
        if (!created.ok) return json(res, { error: created.error }, 400);
        const normalizedId = created.id;
        bus.subscribe(normalizedId, async (m) => {
          if (m.type === "task" && typeof m.payload === "string") {
            const r = await runAgent(config, `bus:${m.from}`, normalizedId, m.payload);
            bus.send({ from: normalizedId, to: m.from, type: "result", payload: r });
          }
        });
        const createdAgent = config.agents[normalizedId];
        logActivity("system", normalizedId, `🧩 Agent 创建: ${createdAgent.name} (${createdAgent.role})`);
        console.log(`[server] Agent created: ${normalizedId} → ${createdAgent.name} [${createdAgent.role}] model=${createdAgent.model}`);

        if (configPath && existsSync(configPath)) {
          try {
            const { parse: parseYaml, stringify: stringifyYaml } = await import("yaml");
            const raw = readFileSync(configPath, "utf-8");
            const parsed = parseYaml(raw) || {};
            if (!parsed.agents) parsed.agents = {};
            parsed.agents[normalizedId] = {
              name: createdAgent.name,
              model: createdAgent.model,
              systemPrompt: createdAgent.systemPrompt,
              role: createdAgent.role,
              tools: createdAgent.tools || [],
            };
            writeFileSync(configPath, stringifyYaml(parsed, { lineWidth: 0 }), "utf-8");
          } catch (e: any) { console.warn("[server] Failed to persist agent to config:", e.message); }
        }
        return json(res, { ok: true, agent: { id: normalizedId, ...createdAgent } });
      } catch (e: any) { return json(res, { error: e.message }, 500); }
    }

    if (url === "/api/agents" && method === "GET") {
      return json(res, { agents: listAgents(config) });
    }
    if (url === "/api/agents/consistency" && method === "GET") {
      const list = listAgents(config);
      const names = new Map<string, string[]>();
      for (const a of list) {
        const key = a.name.trim().toLowerCase();
        const arr = names.get(key) ?? [];
        arr.push(a.id);
        names.set(key, arr);
      }
      const duplicateNames = [...names.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([name, ids]) => ({ name, ids }));
      const invalid = list.filter(a => !/^[a-z0-9_-]+$/.test(a.id));
      return json(res, {
        ok: duplicateNames.length === 0 && invalid.length === 0,
        total: list.length,
        duplicateNames,
        invalidIds: invalid.map(a => a.id),
      });
    }
    if (url === "/api/agents/state" && method === "GET") {
      const runtimeById = new Map(getAgentRuntimeStates().map(s => [s.id, s]));
      return json(res, {
        agents: listAgents(config).map(a => {
          const rt = runtimeById.get(a.id);
          return {
            id: a.id,
            name: a.name,
            role: a.role,
            status: rt?.status ?? "idle",
            lastActiveAt: rt?.lastActiveAt ?? 0,
            totalRuns: rt?.totalRuns ?? 0,
            lastTaskPreview: rt?.lastTaskPreview ?? "",
          };
        }),
      });
    }

    if (url === "/api/tools" && method === "GET") {
      return json(res, { tools: listTools().map(t => ({ name: t.name, description: t.description })) });
    }

    if (url === "/api/activity" && method === "GET") {
      return json(res, { timeline: activityLog.slice(-200) });
    }

    if (url === "/api/evolution" && method === "GET") {
      return json(res, { events: evolutionLog.slice(-50).reverse() });
    }

    if (url === "/api/bus" && method === "GET") {
      return json(res, { messages: bus.history() });
    }

    if (url === "/api/memory/recent" && method === "GET") {
      return json(res, { messages: getRecentMessages(50) });
    }

    if (url.startsWith("/api/memory/search") && method === "GET") {
      const q = new URL(fullUrl, "http://localhost").searchParams.get("q") ?? "";
      return json(res, { results: searchMemory(q, undefined, 20) });
    }

    if (url === "/api/memory/all" && method === "GET") {
      const facts = getUserFacts();
      return json(res, { facts, text: facts.map(f => `${f.key}: ${f.value}`).join("\n") });
    }

    if (url.startsWith("/api/memory/model") && method === "GET") {
      const facts = getUserFacts();

      const categories = [
        { id: "gene", name: "基因层", icon: "🧬", keys: ["生日","属相","星座","血型","八字","出生地","籍贯","年龄"] },
        { id: "personality", name: "人格层", icon: "🎭", keys: ["姓名","名字","MBTI","九型","大五","核心特质","自我认知","人生信条","价值观"] },
        { id: "character", name: "性格层", icon: "🧠", keys: ["内向","外向","理性","感性","决策","沟通","沟通风格","情绪基调","性格"] },
        { id: "likes", name: "爱好层", icon: "❤️", keys: ["喜欢","讨厌","食物","音乐","电影","书","运动","旅行","收藏","笑点","偏好"] },
        { id: "skill", name: "技能层", icon: "⚡", keys: ["擅长","专业","技能","语言","特长","工作"] },
        { id: "expression", name: "表现层", icon: "💬", keys: ["口头禅","习惯","作息","近期状态","休息偏好","近期关注"] },
        { id: "people", name: "关系层", icon: "👥", keys: ["家人","父母","伴侣","朋友","同事","重要的人","宠物"] },
        { id: "moments", name: "经历层", icon: "📌", keys: ["纪念日","转折","难忘","成就","经历","遗憾"] },
        { id: "goals", name: "目标层", icon: "🎯", keys: ["目标","计划","理想","焦虑","在忙","项目","梦想"] },
        { id: "emotion", name: "情感层", icon: "💭", keys: ["心情","情绪","压力","开心","烦","累","状态","近期情绪","情绪变化"] },
        { id: "meta", name: "玄学层", icon: "🔮", keys: ["命理","五行","运势","玄学"] },
      ];

      const result = categories.map(cat => {
        const matched = facts.filter(f => cat.keys.some(k => f.key.includes(k)));
        return { ...cat, facts: matched, filled: matched.length > 0 };
      });

      const uncategorized = facts.filter(f =>
        !categories.some(cat => cat.keys.some(k => f.key.includes(k)))
        && !["我的名字","称呼用户为","关系定义"].includes(f.key)
      );

      const filledCount = result.filter(c => c.filled).length;
      const identity = {
        myName: facts.find(f => f.key === "我的名字")?.value,
        callUser: facts.find(f => f.key === "称呼用户为")?.value,
        relationship: facts.find(f => f.key === "关系定义")?.value,
      };

      return json(res, { categories: result, uncategorized, identity, totalFacts: facts.length, filledCategories: filledCount, totalCategories: categories.length });
    }

    if (url.startsWith("/api/bond") && method === "GET") {
      const factCount = getUserFactCount();
      const facts = getUserFacts();
      let level: string, emoji: string;
      if (factCount === 0) { level = "初见"; emoji = "🫧"; }
      else if (factCount < 5) { level = "认识中"; emoji = "🪼"; }
      else if (factCount < 15) { level = "熟悉了"; emoji = "💙"; }
      else if (factCount < 30) { level = "老朋友"; emoji = "💎"; }
      else { level = "灵魂伴侣"; emoji = "🌊"; }
      const myName = facts.find(f => f.key === "我的名字")?.value
        || facts.find(f => f.key === "agent_name")?.value
        || facts.find(f => f.key === "名字" && (f.value?.length ?? 0) < 15)?.value;
      const callUser = facts.find(f => f.key === "称呼用户为")?.value;
      const defaultAgentName = (() => { const a = listAgents(config).find(x => x.role === "orchestrator") || listAgents(config)[0]; return a?.name ?? "Ome"; })();
      const totalCategories = 11;
      const catKeys = [
        ["生日","属相","星座","血型","八字","出生地","年龄"],
        ["MBTI","九型","大五","核心特质","信条","价值观"],
        ["内向","外向","理性","感性","决策","沟通","沟通风格","性格"],
        ["喜欢","讨厌","食物","音乐","电影","运动","旅行","笑点","偏好"],
        ["擅长","专业","技能","语言","特长","工作"],
        ["口头禅","习惯","作息","近期状态","休息偏好","近期关注"],
        ["家人","伴侣","朋友","同事","宠物"],
        ["纪念日","转折","难忘","成就","经历","遗憾"],
        ["目标","计划","梦想","焦虑","在忙"],
        ["心情","情绪","压力","开心","烦","累","近期情绪","情绪变化"],
        ["命理","五行","运势"],
      ];
      const filledCategories = catKeys.filter(keys => facts.some(f => keys.some(k => f.key.includes(k)))).length;
      const completeness = Math.round(filledCategories / totalCategories * 100);
      const xp = factCount * 10 + filledCategories * 50;
      const milestones = [
        { level: 1, name: "初见", xp: 0, emoji: "🫧" },
        { level: 2, name: "认识中", xp: 50, emoji: "🪼" },
        { level: 3, name: "熟悉了", xp: 150, emoji: "💙" },
        { level: 4, name: "老朋友", xp: 400, emoji: "💎" },
        { level: 5, name: "灵魂伴侣", xp: 900, emoji: "🌊" },
      ];
      const currentMilestone = milestones.find((_, i) => xp < (milestones[i + 1]?.xp ?? Infinity)) || milestones[milestones.length - 1];
      const nextMilestone = milestones[milestones.findIndex(m => m.name === currentMilestone.name) + 1];
      const progressToNext = nextMilestone ? Math.round(((xp - currentMilestone.xp) / (nextMilestone.xp - currentMilestone.xp)) * 100) : 100;
      return json(res, {
        level, emoji, factCount, myName: myName || defaultAgentName, callUser,
        completeness, filledCategories, totalCategories,
        xp, currentMilestone, nextMilestone, progressToNext,
      });
    }

    if (url.startsWith("/api/chat/poll") && method === "GET") {
      const sinceId = Number(new URL(fullUrl, "http://localhost").searchParams.get("since") ?? "0");
      const newMsgs = getMessagesSince(sinceId, 100, OWNER_SESSION);
      return json(res, { messages: newMsgs, latestId: newMsgs.length ? newMsgs[newMsgs.length - 1].id : sinceId });
    }

    if (url === "/api/reminders" && method === "GET") {
      return json(res, { reminders: getReminders() });
    }

    // 游戏化系统 API
    if (url === "/api/progress" && method === "GET") {
      return json(res, getProgress());
    }

    if (url === "/api/achievements" && method === "GET") {
      return json(res, { achievements: getAllAchievements() });
    }

    if (url === "/api/levels" && method === "GET") {
      return json(res, { levels: getAllLevels() });
    }

    // 向量记忆搜索 API
    if (url.startsWith("/api/vector/search") && method === "GET") {
      const params = new URL(fullUrl, "http://localhost").searchParams;
      const query = params.get("q") || "";
      const type = params.get("type") as "message" | "fact" | "event" | undefined;
      const limit = parseInt(params.get("limit") || "10");
      
      if (!query) return json(res, { error: "query required" }, 400);
      
      const results = searchVectorMemory(query, { limit, type, minSimilarity: 0.3 });
      return json(res, {
        query,
        results: results.map(r => ({
          text: r.memory.text,
          similarity: r.similarity,
          type: r.memory.metadata.type,
          timestamp: r.memory.metadata.timestamp,
        })),
      });
    }

    if (url === "/api/vector/stats" && method === "GET") {
      return json(res, getVectorMemoryStats());
    }

    // WebSocket 统计
    if (url === "/api/ws/stats" && method === "GET") {
      return json(res, getWSStats());
    }

    // OmeLand API
    if (url === "/api/omeland/agents" && method === "GET") {
      return json(res, { agents: getAllAgents() });
    }

    if (url.startsWith("/api/omeland/agent/") && method === "GET") {
      const agentId = url.split("/").pop();
      if (!agentId) return json(res, { error: "agentId required" }, 400);
      const profile = getAgentProfile(agentId);
      if (!profile) return json(res, { error: "agent not found" }, 404);
      const posts = getAgentPosts(agentId, 20);
      return json(res, { profile, posts });
    }

    if (url === "/api/omeland/feed" && method === "GET") {
      const params = new URL(fullUrl, "http://localhost").searchParams;
      const agentId = params.get("agentId") || "owner";
      const limit = parseInt(params.get("limit") || "20");
      const offset = parseInt(params.get("offset") || "0");
      const feed = getFeed(agentId, { limit, offset });
      return json(res, { feed });
    }

    if (url === "/api/omeland/post" && method === "POST") {
      try {
        const body = JSON.parse(await collectBody(req));
        const { agentId, content, type, tags, visibility } = body;
        if (!agentId || !content) return json(res, { error: "agentId and content required" }, 400);
        const post = createPost(agentId, content, type, { tags, visibility });
        
        // 推送新帖子事件
        pushEvent({
          type: "new_post",
          data: post,
        });
        
        return json(res, { ok: true, post });
      } catch (e: any) {
        return json(res, { error: e.message }, 500);
      }
    }

    if (url === "/api/omeland/follow" && method === "POST") {
      try {
        const body = JSON.parse(await collectBody(req));
        const { fromAgentId, toAgentId } = body;
        if (!fromAgentId || !toAgentId) return json(res, { error: "fromAgentId and toAgentId required" }, 400);
        const success = followAgent(fromAgentId, toAgentId);
        return json(res, { ok: success });
      } catch (e: any) {
        return json(res, { error: e.message }, 500);
      }
    }

    if (url === "/api/omeland/like" && method === "POST") {
      try {
        const body = JSON.parse(await collectBody(req));
        const { agentId, postId } = body;
        if (!agentId || !postId) return json(res, { error: "agentId and postId required" }, 400);
        const success = likePost(agentId, postId);
        return json(res, { ok: success });
      } catch (e: any) {
        return json(res, { error: e.message }, 500);
      }
    }

    if (url === "/api/omeland/match" && method === "GET") {
      const params = new URL(fullUrl, "http://localhost").searchParams;
      const agentId = params.get("agentId") || "owner";
      const limit = parseInt(params.get("limit") || "10");
      const matches = matchAgents(agentId, limit);
      return json(res, { matches });
    }

    if (url === "/api/omeland/stats" && method === "GET") {
      return json(res, getOmeLandStats());
    }

    // 60秒魔法引导系统
    if (url === "/api/onboarding" && method === "POST") {
      try {
        const body = JSON.parse(await collectBody(req));
        const { callMe, personality, interests, goals, relationship } = body;
        
        let factsCreated = 0;
        
        // 保存用户称呼
        if (callMe) {
          saveUserFact(OWNER_SESSION, "称呼用户为", callMe);
          factsCreated++;
        }
        
        // 保存性格标签
        if (personality && personality.length > 0) {
          saveUserFact(OWNER_SESSION, "性格特质", personality.join("、"));
          factsCreated++;
        }
        
        // 保存兴趣爱好
        if (interests && interests.length > 0) {
          saveUserFact(OWNER_SESSION, "兴趣爱好", interests.join("、"));
          factsCreated++;
        }
        
        // 保存目标期望
        if (goals && goals.length > 0) {
          saveUserFact(OWNER_SESSION, "期望帮助", goals.join("、"));
          factsCreated++;
        }
        
        // 保存关系定义
        if (relationship) {
          const relationshipMap: Record<string, string> = {
            friend: "朋友",
            assistant: "助手",
            companion: "伙伴",
            mentor: "导师"
          };
          saveUserFact(OWNER_SESSION, "关系定义", relationshipMap[relationship] || "朋友");
          factsCreated++;
        }
        
        // 更新游戏化系统
        trackFact(getUserFactCount());
        addXP(factsCreated * 10, "onboarding");
        
        // 解锁首次成就
        unlockAchievement("first_fact");
        if (factsCreated >= 5) unlockAchievement("fact_10");
        
        const progress = getProgress();
        
        logActivity("system", "onboarding", `🎉 引导完成: ${callMe} · ${factsCreated} 条记忆`);
        logEvolution("onboarding", `新用户引导完成 · ${callMe}`, "🎉");
        
        return json(res, { 
          ok: true, 
          factsCreated, 
          bondLevel: progress.levelName,
          xpGained: factsCreated * 10,
          totalFacts: getUserFactCount(),
          level: progress.level,
          achievements: progress.achievements.length
        });
      } catch (e: any) { 
        return json(res, { error: e.message }, 500); 
      }
    }

    // 数据导入：批量文本提取用户画像
    if (url === "/api/import" && method === "POST") {
      try {
        const body = JSON.parse(await collectBody(req));
        const text = String(body.text ?? "").trim();
        if (!text || text.length < 10) return json(res, { error: "text too short" }, 400);
        const { extractFactsFromBulkText } = await import("./agent.js");
        const extracted = extractFactsFromBulkText(text);
        for (const f of extracted) saveUserFact(OWNER_SESSION, f.key, f.value);
        logActivity("memory", "import", `📥 批量导入 ${extracted.length} 条记忆`);
        if (extracted.length) logEvolution("import", `批量导入 ${extracted.length} 条画像数据`, "📥");
        return json(res, { ok: true, count: extracted.length, facts: extracted });
      } catch (e: any) { return json(res, { error: e.message }, 500); }
    }

    // 分享名片数据
    if (url === "/api/share-card" && method === "GET") {
      const facts = getUserFacts();
      const myName = facts.find(f => f.key === "我的名字")?.value ?? "Ome";
      const callUser = facts.find(f => f.key === "称呼用户为")?.value;
      const relationship = facts.find(f => f.key === "关系定义")?.value ?? "分身";
      const mbti = facts.find(f => f.key === "MBTI")?.value;
      const zodiac = facts.find(f => f.key === "属相")?.value;
      const constellation = facts.find(f => f.key === "星座")?.value;
      const catKeys = [
        ["生日","属相","星座","血型"],["MBTI","九型","大五","核心特质"],
        ["内向","外向","理性","感性","性格"],["喜欢","讨厌","食物","音乐"],
        ["擅长","专业","技能","工作"],["口头禅","作息","习惯"],
        ["家人","伴侣","朋友","宠物"],["纪念日","转折","成就","经历"],
        ["目标","计划","梦想"],["心情","情绪","压力","近期情绪"],["命理","五行","运势"],
      ];
      const filledCategories = catKeys.filter(keys => facts.some(f => keys.some(k => f.key.includes(k)))).length;
      return json(res, {
        myName, callUser, relationship, mbti, zodiac, constellation,
        factCount: facts.length, filledCategories, totalCategories: 11,
        completeness: Math.round(filledCategories / 11 * 100),
        topFacts: facts.slice(0, 6).map(f => `${f.key}: ${f.value}`),
      });
    }

    // 每日话题
    if (url === "/api/daily-prompt" && method === "GET") {
      const prompts = [
        "今天心情怎么样？","最近在追什么剧/番？","周末有什么计划？",
        "最近读了什么好书吗？","有没有什么烦心事想聊聊？","如果明天放假，你最想做什么？",
        "你最近学了什么新技能？","有没有想对过去的自己说的话？","你理想中的一天是什么样的？",
        "最近有什么让你开心的小事？","你觉得自己最大的优点是什么？","今天吃了什么好吃的？",
        "有没有一首歌能代表你现在的心情？","你觉得自己活到现在最正确的决定是什么？",
        "如果能拥有一个超能力，你选什么？","你最珍惜的人是谁？",
      ];
      const dayIndex = Math.floor(Date.now() / 86400000) % prompts.length;
      return json(res, { prompt: prompts[dayIndex], index: dayIndex });
    }

    if (url.startsWith("/api/chat/history") && method === "GET") {
      const params = new URL(fullUrl, "http://localhost").searchParams;
      const sessionId = params.get("sessionId") ?? "";
      const merged = params.get("merged") === "1" || params.get("merged") === "true";
      if (merged || sessionId === "owner") {
        return json(res, { messages: getMergedHistory(undefined, 150) });
      }
      if (!sessionId) return json(res, { messages: [] });
      const key = sessionId === "owner" ? "owner" : `web:${sessionId}`;
      return json(res, { messages: getHistoryForSession(key, undefined, 100) });
    }

    if (url === "/api/chat" && method === "POST") {
      try {
        const body = JSON.parse(await collectBody(req));
        const msg = body.message?.trim();
        if (!msg) return json(res, { error: "message required" }, 400);

        let agentId: string;
        let cleanText: string;
        if (body.agentId && config.agents[body.agentId]) {
          agentId = body.agentId;
          const routed = routeAgent(config, msg);
          cleanText = routed.agentId !== agentId ? msg : routed.cleanText;
        } else {
          const routed = routeAgent(config, msg);
          agentId = routed.agentId;
          cleanText = routed.cleanText;
        }

        logActivity("user_in", agentId, msg.slice(0, 120), "web", OWNER_SESSION);
        trackMessage(agentId);
        
        // 添加用户消息到向量记忆
        addVectorMemory(msg, "message", {
          sessionId: OWNER_SESSION,
          agentId,
        });
        
        const reply = await runAgent(config, OWNER_SESSION, agentId, cleanText);
        logActivity("agent_out", agentId, reply.slice(0, 150), "web", OWNER_SESSION);
        
        // 添加 AI 回复到向量记忆
        addVectorMemory(reply, "message", {
          sessionId: OWNER_SESSION,
          agentId,
        });
        
        // 实时推送新消息
        pushEvent({
          type: "new_message",
          data: { role: "assistant", content: reply, agentId },
          sessionId: OWNER_SESSION,
        });
        
        // 检查是否升级
        const progress = getProgress();
        
        // 推送进度更新
        if (progress) {
          pushEvent({
            type: "progress_update",
            data: progress,
            sessionId: OWNER_SESSION,
          });
        }
        
        return json(res, { reply, agentId, progress });
      } catch (e: any) { return json(res, { error: e.message }, 500); }
    }

    // --- Static files ---
    const filePath = url === "/" ? "/index.html" : url;
    const fullPath = resolve(webDir, filePath.replace(/^\//, ""));
    if (!fullPath.startsWith(webDir)) { res.writeHead(403); res.end(); return; }
    if (existsSync(fullPath)) {
      res.writeHead(200, { "Content-Type": MIME[extname(fullPath)] ?? "application/octet-stream" });
      res.end(readFileSync(fullPath));
      return;
    }
    json(res, { error: "not found" }, 404);
  });

  logActivity("system", "server", `🪼 OmeClaw 启动 · ${listAgents(config).length} agents · port ${port}`);
  logEvolution("start", "分身系统苏醒", "🪼");

  server.listen(port, () => {
    console.log(`\n  🪼 OmeClaw v0.8.3 — Agent Operating System`);
    console.log(`  ──────────────────────────────────────────`);
    console.log(`  📊 Dashboard:   http://localhost:${port}`);
    console.log(`  🔌 API:         http://localhost:${port}/api/status`);
    console.log(`  🔄 WebSocket:   ws://localhost:${port}/ws`);
    for (const gw of allGateways()) console.log(`  💬 ${gw.name}:${" ".repeat(10 - gw.name.length)}http://localhost:${port}/webhook/${gw.name}`);
    console.log(`  🤖 Agents:      ${listAgents(config).map(a => `${a.name}[${a.role}]`).join(", ")}`);
    console.log(`  🧰 Tools:       ${listTools().map(t => t.name).join(", ")}`);
    if (config.scheduler?.enabled) console.log(`  ⏰ Cron:        ${config.scheduler.jobs.length} scheduled jobs`);
    console.log(`  💾 Memory:      ${dataDir}`);
    console.log();
  });

  // WebSocket 升级处理
  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/ws")) {
      handleWebSocketUpgrade(req, socket, head);
    } else {
      socket.end();
    }
  });

  return server;
}
