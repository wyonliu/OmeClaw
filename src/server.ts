import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { listAgents, routeAgent, runAgent, initAgentBus, agentEvents, startHeartbeat, getReminders, getAgentRuntimeStates } from "./agent.js";
import { initMemory, getMessageCount, searchMemory, getRecentMessages, getHistoryForSession, getMergedHistory, getUserFacts, getUserFactCount, getMessagesSince } from "./memory.js";
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
  initAgentBus(config);

  agentEvents.on("tool_call", (d: any) => {
    logActivity("tool", d.agentId, `🔧 ${d.tool}(${JSON.stringify(d.args).slice(0, 80)})`);
    if (d.tool === "remember_about_user") {
      logActivity("memory", d.agentId, `🧠 记忆写入: ${d.args?.key} = ${d.args?.value}`.slice(0, 120));
      logEvolution("memory", `记忆生长 · ${d.args?.key}`, "🧠");
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
        status: "running", version: "0.4.0", uptime: process.uptime(),
        agents: listAgents(config).map(a => ({ id: a.id, name: a.name, role: a.role })),
        agentRuntime: runtime,
        gateways: allGateways().map(g => g.name),
        tools: listTools().map(t => t.name),
        memory: { messages: getMessageCount() },
        busAgents: bus.activeAgents(),
        scheduler: config.scheduler?.enabled ? { jobs: config.scheduler.jobs.length } : null,
      });
    }

    // Agent creation (POST must come before GET)
    if (url === "/api/agents" && method === "POST") {
      try {
        const body = JSON.parse(await collectBody(req));
        const { id, name, model, systemPrompt, role, tools } = body;
        if (!id || !name || !model) return json(res, { error: "id, name, model required" }, 400);
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) return json(res, { error: "Invalid id (use alphanumeric, _, -)" }, 400);
        if (config.agents[id]) return json(res, { error: `Agent "${id}" already exists` }, 400);

        const modelId = model.includes(":") ? model.split(":")[0] : model;
        if (!config.models[modelId]) return json(res, { error: `Unknown model "${modelId}". Available: ${Object.keys(config.models).join(", ")}` }, 400);

        config.agents[id] = {
          name, model,
          systemPrompt: systemPrompt || "You are a helpful assistant.",
          role: role || "worker",
          tools: tools || [],
        };
        bus.subscribe(id, async (m) => {
          if (m.type === "task" && typeof m.payload === "string") {
            const r = await runAgent(config, `bus:${m.from}`, id, m.payload);
            bus.send({ from: id, to: m.from, type: "result", payload: r });
          }
        });
        logActivity("system", id, `🧩 Agent 创建: ${name} (${role ?? "worker"})`);
        console.log(`[server] Agent created: ${id} → ${name} [${role}] model=${model}`);

        if (configPath && existsSync(configPath)) {
          try {
            const { parse: parseYaml, stringify: stringifyYaml } = await import("yaml");
            const raw = readFileSync(configPath, "utf-8");
            const parsed = parseYaml(raw) || {};
            if (!parsed.agents) parsed.agents = {};
            parsed.agents[id] = { name, model, systemPrompt: systemPrompt || "You are a helpful assistant.", role: role || "worker", tools: tools || [] };
            writeFileSync(configPath, stringifyYaml(parsed, { lineWidth: 0 }), "utf-8");
          } catch (e: any) { console.warn("[server] Failed to persist agent to config:", e.message); }
        }
        return json(res, { ok: true, agent: { id, ...config.agents[id] } });
      } catch (e: any) { return json(res, { error: e.message }, 500); }
    }

    if (url === "/api/agents" && method === "GET") {
      return json(res, { agents: listAgents(config) });
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
        const reply = await runAgent(config, OWNER_SESSION, agentId, cleanText);
        logActivity("agent_out", agentId, reply.slice(0, 150), "web", OWNER_SESSION);
        return json(res, { reply, agentId });
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
    console.log(`\n  🪼 OmeClaw v0.4.0 — Agent Operating System`);
    console.log(`  ──────────────────────────────────────────`);
    console.log(`  📊 Dashboard:   http://localhost:${port}`);
    console.log(`  🔌 API:         http://localhost:${port}/api/status`);
    for (const gw of allGateways()) console.log(`  💬 ${gw.name}:${" ".repeat(10 - gw.name.length)}http://localhost:${port}/webhook/${gw.name}`);
    console.log(`  🤖 Agents:      ${listAgents(config).map(a => `${a.name}[${a.role}]`).join(", ")}`);
    console.log(`  🧰 Tools:       ${listTools().map(t => t.name).join(", ")}`);
    if (config.scheduler?.enabled) console.log(`  ⏰ Cron:        ${config.scheduler.jobs.length} scheduled jobs`);
    console.log(`  💾 Memory:      ${dataDir}`);
    console.log();
  });
  return server;
}
