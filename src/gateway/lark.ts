import * as Lark from "@larksuiteoapi/node-sdk";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Config } from "../config.js";
import type { GatewayAdapter, GatewayMessage, OnMessage } from "./base.js";

interface RateEntry { count: number; resetAt: number }
const rateBucket = new Map<string, RateEntry>();
const processedEvents = new Set<string>();

function rateCheck(userId: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  let e = rateBucket.get(userId);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + windowMs }; rateBucket.set(userId, e); }
  return ++e.count <= limit;
}

function dedup(id: string): boolean {
  if (processedEvents.has(id)) return true;
  processedEvents.add(id);
  if (processedEvents.size > 5000) { const a = [...processedEvents]; for (let i = 0; i < 2500; i++) processedEvents.delete(a[i]); }
  return false;
}

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let buf = "";
    req.on("data", (c: Buffer) => buf += c.toString());
    req.on("end", () => ok(buf));
    req.on("error", fail);
  });
}

export function createLarkAdapter(config: Config, onMessage: OnMessage): GatewayAdapter | null {
  const larkCfg = config.gateways?.lark;
  if (!larkCfg?.enabled) return null;

  const appId = larkCfg.appId!;
  const appSecret = larkCfg.appSecret!;
  const verifyToken = larkCfg.verificationToken ?? "";
  const allowList = larkCfg.allowFrom ?? [];

  const client = new Lark.Client({ appId, appSecret });

  async function sendReply(chatId: string, text: string): Promise<string | undefined> {
    try {
      const res = await client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: { receive_id: chatId, msg_type: "text", content: JSON.stringify({ text }) },
      });
      return (res as any)?.data?.message_id;
    } catch (err: any) {
      console.error("[lark] Failed to send:", err.message);
      return undefined;
    }
  }

  async function updateMessage(messageId: string, text: string) {
    try {
      await client.im.message.patch({
        path: { message_id: messageId },
        data: { content: JSON.stringify({ text }) },
      });
    } catch {
      // patch may not be supported; send new message instead — handled by caller
    }
  }

  async function processMessage(eventData: any) {
    const msgId = eventData.message?.message_id;
    if (!msgId || dedup(msgId)) return;

    const senderId = eventData.sender?.sender_id?.open_id ?? "unknown";
    const chatId = eventData.message?.chat_id;

    if (allowList.length && !allowList.includes(senderId)) return;
    if (!rateCheck(senderId)) {
      if (chatId) await sendReply(chatId, "请求过于频繁，请稍后再试");
      return;
    }
    if (eventData.message?.message_type !== "text") return;

    let text = "";
    try {
      const content = JSON.parse(eventData.message.content);
      text = (content.text ?? "").trim();
    } catch { return; }
    if (!text) return;

    console.log(`[lark] ← ${senderId}: ${text.slice(0, 80)}`);

    // Immediate feedback: send "thinking" message right away
    const thinkingId = await sendReply(chatId, "🤔 正在思考...");

    const msg: GatewayMessage = { gateway: "lark", senderId, chatId, text };
    try {
      const reply = await onMessage(msg);
      console.log(`[lark] → reply (${reply.length} chars)`);

      // Try to update the thinking message; if fails, send new message
      if (thinkingId) {
        try {
          await updateMessage(thinkingId, reply);
          return;
        } catch { /* fall through to send new */ }
      }
      await sendReply(chatId, reply);
    } catch (err: any) {
      console.error("[lark] Processing error:", err.message);
      const errMsg = `处理出错: ${err.message}`;
      if (thinkingId) {
        try { await updateMessage(thinkingId, errMsg); return; } catch {}
      }
      await sendReply(chatId, errMsg);
    }
  }

  return {
    name: "lark",
    async init() {
      try {
        const LarkModule = Lark as any;
        if (typeof LarkModule.WSClient !== "function") throw new Error("WSClient not available");

        const dispatcher = new Lark.EventDispatcher({}).register({
          "im.message.receive_v1": async (data: any) => {
            await processMessage(data);
          },
        });

        const wsClient = new LarkModule.WSClient({
          appId,
          appSecret,
          loggerLevel: LarkModule.LoggerLevel?.info ?? 3,
          domain: LarkModule.Domain?.Feishu,
        });

        await wsClient.start({ eventDispatcher: dispatcher });
        console.log("[lark] ✅ WebSocket connected (no ngrok needed)");
      } catch (err: any) {
        console.warn(`[lark] WebSocket failed: ${err.message}, using webhook mode`);
      }
    },

    async handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      if (!req.url?.startsWith("/webhook/lark")) return false;
      if (req.method !== "POST") { res.writeHead(200); res.end("ok"); return true; }

      try {
        const body = await collectBody(req);
        const payload = JSON.parse(body);

        if (payload.type === "url_verification" || payload.challenge) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ challenge: payload.challenge }));
          return true;
        }

        const token = payload.header?.token ?? payload.token;
        if (verifyToken && token && token !== verifyToken) {
          res.writeHead(200); res.end("ok"); return true;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ msg: "ok" }));

        const eventData = payload.event ?? payload;
        void processMessage(eventData).catch(e => console.error("[lark] Event error:", e));
        return true;
      } catch (err: any) {
        console.error("[lark] Webhook error:", err.message);
        res.writeHead(200); res.end("ok");
        return true;
      }
    },

    async sendMessage(chatId: string, text: string) { await sendReply(chatId, text); },
  };
}
