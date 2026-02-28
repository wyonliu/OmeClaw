import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { listAgents, routeAgent, runAgent, initAgentBus, agentEvents } from "./agent.js";
import { initMemory, getMessageCount, searchMemory, getRecentMessages } from "./memory.js";
import { bus } from "./bus.js";
import { listTools } from "./tools.js";
import { createLarkAdapter } from "./gateway/lark.js";
import { createTelegramAdapter } from "./gateway/telegram.js";
import { createDiscordAdapter } from "./gateway/discord.js";
import { registerGateway, allGateways, type GatewayMessage } from "./gateway/base.js";
import { startScheduler } from "./scheduler.js";

const __dir = resolve(fileURLToPath(import.meta.url), "../..");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
};

interface ActivityLog { time: number; type: string; agent: string; detail: string }
const activityLog: ActivityLog[] = [];
function logActivity(type: string, agent: string, detail: string) {
  activityLog.push({ time: Date.now(), type, agent, detail });
  if (activityLog.length > 500) activityLog.splice(0, 250);
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}
function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => { let b = ""; req.on("data", c => b += c); req.on("end", () => ok(b)); req.on("error", fail); });
}

export function startServer(config: Config, port: number, _configPath?: string) {
  const dataDir = resolve(process.cwd(), config.memory?.dataDir ?? ".omeclaw");
  initMemory(dataDir);
  initAgentBus(config);

  agentEvents.on("tool_call", (d: any) => logActivity("tool_call", d.agentId, `${d.tool}(${JSON.stringify(d.args).slice(0, 100)})`));
  agentEvents.on("tool_result", (d: any) => logActivity("tool_result", d.agentId, `${d.tool} → ${d.result}`));

  const onMessage = async (msg: GatewayMessage) => {
    logActivity("gateway_msg", msg.gateway, `${msg.senderName ?? msg.senderId}: ${msg.text.slice(0, 80)}`);
    const { agentId, cleanText } = routeAgent(config, msg.text);
    const reply = await runAgent(config, `${msg.gateway}:${msg.senderId}`, agentId, cleanText);
    logActivity("gateway_reply", agentId, reply.slice(0, 100));
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
        logActivity("agent_created", id, `${name} (${role ?? "worker"})`);
        console.log(`[server] Agent created: ${id} → ${name} [${role}] model=${model}`);
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
      return json(res, { logs: activityLog.slice(-100) });
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

        logActivity("web_chat", agentId, msg.slice(0, 80));
        const reply = await runAgent(config, `web:${body.sessionId ?? "default"}`, agentId, cleanText);
        logActivity("web_reply", agentId, reply.slice(0, 100));
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

  server.listen(port, () => {
    console.log(`\n  ⭕▸ OmeClaw v0.4.0 — Agent Operating System`);
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
