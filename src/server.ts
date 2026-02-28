import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { listAgents, routeAgent, runAgent, initAgentBus, agentEvents } from "./agent.js";
import { initMemory, getMessageCount, searchMemory, getRecentMessages, getHistoryForSession, getUserFacts, getUserFactCount } from "./memory.js";
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

interface ActivityLog { time: number; type: string; agent: string; detail: string; source?: string }
const activityLog: ActivityLog[] = [];

let larkLogChatId = "";
function logActivity(type: string, agent: string, detail: string, source?: string) {
  activityLog.push({ time: Date.now(), type, agent, detail, source });
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
    if (d.tool === "remember_about_user") logActivity("memory", d.agentId, `🧠 记忆写入: ${d.args?.key} = ${d.args?.value}`.slice(0, 120));
  });
  agentEvents.on("tool_result", (d: any) => logActivity("tool_result", d.agentId, `✅ ${d.tool} → ${d.result.slice(0, 100)}`));
  agentEvents.on("agent_created", (d: any) => logActivity("agent_created", d.id, `🧬 新分身体唤醒: ${d.name} [${d.role}]`));

  const onMessage = async (msg: GatewayMessage) => {
    logActivity("user_in", msg.gateway, `${msg.text.slice(0, 120)}`, msg.gateway);
    const { agentId, cleanText } = routeAgent(config, msg.text);
    const reply = await runAgent(config, `${msg.gateway}:${msg.senderId}`, agentId, cleanText);
    logActivity("agent_out", agentId, reply.slice(0, 150), msg.gateway);
    return reply;
  };

  const lark = createLarkAdapter(config, onMessage);
  if (lark) { registerGateway(lark); lark.init(); }
  const tg = createTelegramAdapter(config, onMessage);
  if (tg) { registerGateway(tg); tg.init(); }
  const dc = createDiscordAdapter(config, onMessage);
  if (dc) { registerGateway(dc); dc.init(); }

  startScheduler(config);

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
      return json(res, {
        status: "running", version: "0.4.0", uptime: process.uptime(),
        agents: listAgents(config).map(a => ({ id: a.id, name: a.name, role: a.role })),
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

    if (url === "/api/tools" && method === "GET") {
      return json(res, { tools: listTools().map(t => ({ name: t.name, description: t.description })) });
    }

    if (url === "/api/activity" && method === "GET") {
      return json(res, { timeline: activityLog.slice(-200) });
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

    if (url.startsWith("/api/memory/model") && method === "GET") {
      const facts = getUserFacts();

      const categories = [
        { id: "basic", name: "基本画像", icon: "👤", keys: ["姓名","名字","年龄","性别","生日","城市","职业","公司","行业","工作"] },
        { id: "tags", name: "身份标签", icon: "🏷️", keys: ["星座","属相","生肖","八字","MBTI","血型"] },
        { id: "personality", name: "性格特质", icon: "🧠", keys: ["性格","内向","外向","理性","感性","沟通","决策"] },
        { id: "likes", name: "喜好偏好", icon: "❤️", keys: ["喜欢","讨厌","食物","音乐","电影","书","运动","爱好","兴趣","习惯","作息"] },
        { id: "values", name: "价值观", icon: "⚖️", keys: ["信条","座右铭","底线","原则","态度","价值"] },
        { id: "people", name: "身边的人", icon: "👥", keys: ["家人","父母","伴侣","恋人","配偶","朋友","同事","子女","兄弟","姐妹"] },
        { id: "moments", name: "重要时刻", icon: "📌", keys: ["纪念日","里程碑","转折","经历","特殊"] },
        { id: "goals", name: "目标梦想", icon: "🎯", keys: ["目标","计划","理想","梦想","焦虑","困扰","在忙","项目"] },
        { id: "emotion", name: "情感状态", icon: "💭", keys: ["心情","情绪","开心","难过","压力","烦","累","状态"] },
        { id: "meta", name: "玄学档案", icon: "🔮", keys: ["命理","紫微","五行","本命","运势","玄学"] },
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
      const myName = facts.find(f => f.key === "我的名字")?.value;
      const callUser = facts.find(f => f.key === "称呼用户为")?.value;
      const totalCategories = 10;
      const catKeys = [
        ["姓名","名字","年龄","性别","生日","城市","职业","工作"],
        ["星座","属相","八字","MBTI","血型"],
        ["性格","内向","外向","理性","感性"],
        ["喜欢","讨厌","食物","音乐","电影","爱好"],
        ["信条","底线","原则","价值"],
        ["家人","伴侣","朋友","同事"],
        ["纪念日","转折","经历"],
        ["目标","计划","梦想","在忙"],
        ["心情","情绪","压力","状态"],
        ["命理","五行","运势"],
      ];
      const filledCategories = catKeys.filter(keys => facts.some(f => keys.some(k => f.key.includes(k)))).length;
      const completeness = Math.round(filledCategories / totalCategories * 100);
      return json(res, { level, emoji, factCount, myName, callUser, completeness, filledCategories, totalCategories });
    }

    if (url.startsWith("/api/chat/history") && method === "GET") {
      const params = new URL(fullUrl, "http://localhost").searchParams;
      const sessionId = params.get("sessionId") ?? "";
      if (!sessionId) return json(res, { messages: [] });
      const key = `web:${sessionId}`;
      return json(res, { messages: getHistoryForSession(key, undefined, 100) });
    }

    if (url === "/api/chat" && method === "POST") {
      try {
        const body = JSON.parse(await collectBody(req));
        const msg = body.message?.trim();
        if (!msg) return json(res, { error: "message required" }, 400);

        // Respect agentId from frontend if provided, otherwise auto-route
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

        logActivity("user_in", agentId, msg.slice(0, 120), "web");
        const reply = await runAgent(config, `web:${body.sessionId ?? "default"}`, agentId, cleanText);
        logActivity("agent_out", agentId, reply.slice(0, 150), "web");
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
