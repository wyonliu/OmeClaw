import * as Lark from "@larksuiteoapi/node-sdk";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Config } from "../config.js";
import type { GatewayAdapter, GatewayMessage, OnMessage } from "./base.js";

const LARK_MSG_MAX = 30000;
const PROCESS_TIMEOUT_MS = 120000;

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

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function createLarkAdapter(config: Config, onMessage: OnMessage): GatewayAdapter | null {
  const larkCfg = config.gateways?.lark;
  if (!larkCfg?.enabled) return null;

  const appId = larkCfg.appId!;
  const appSecret = larkCfg.appSecret!;
  const verifyToken = larkCfg.verificationToken ?? "";
  const allowList = larkCfg.allowFrom ?? [];

  const client = new Lark.Client({ appId, appSecret });

  async function replyToMsg(messageId: string, text: string): Promise<boolean> {
    if (text.length > LARK_MSG_MAX) text = text.slice(0, LARK_MSG_MAX) + "\n\n...(内容过长已截断)";
    try {
      await (client.im.message as any).reply({
        path: { message_id: messageId },
        data: { msg_type: "text", content: JSON.stringify({ text }) },
      });
      console.log(`[lark] ✉ reply sent (${text.length} chars) to msg ${messageId}`);
      return true;
    } catch (err: any) {
      console.warn(`[lark] reply API failed: ${err.message}, falling back to create`);
      return false;
    }
  }

  async function sendToChat(chatId: string, text: string): Promise<boolean> {
    if (text.length > LARK_MSG_MAX) text = text.slice(0, LARK_MSG_MAX) + "\n\n...(内容过长已截断)";
    try {
      await client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: { receive_id: chatId, msg_type: "text", content: JSON.stringify({ text }) },
      });
      console.log(`[lark] ✉ message sent (${text.length} chars) to chat ${chatId}`);
      return true;
    } catch (err: any) {
      console.error(`[lark] create API failed: ${err.message}`);
      return false;
    }
  }

  async function sendReply(msgId: string, chatId: string, text: string): Promise<boolean> {
    if (msgId) {
      const ok = await replyToMsg(msgId, text);
      if (ok) return true;
    }
    if (chatId) return sendToChat(chatId, text);
    console.error("[lark] 无法发送：msgId 和 chatId 都为空");
    return false;
  }

  async function processMessage(eventData: any) {
    const msgId = eventData.message?.message_id;
    if (!msgId || dedup(msgId)) return;

    const senderId = eventData.sender?.sender_id?.open_id ?? "unknown";
    const chatId = eventData.message?.chat_id ?? "";

    if (allowList.length && !allowList.includes(senderId)) return;
    if (!rateCheck(senderId)) {
      await sendReply(msgId, chatId, "请求过于频繁，请稍后再试");
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

    const gwMsg: GatewayMessage = { gateway: "lark", senderId, chatId: chatId || msgId, text };
    try {
      const reply = await withTimeout(
        onMessage(gwMsg),
        PROCESS_TIMEOUT_MS,
        "处理超时，请稍后重试或简化问题。"
      );
      console.log(`[lark] → reply ready (${reply.length} chars)`);
      const ok = await sendReply(msgId, chatId, reply);
      if (!ok) console.error("[lark] 所有发送方式均失败，请检查飞书应用权限：im:message:send_as_bot");
    } catch (err: any) {
      console.error("[lark] 处理异常:", err.message);
      await sendReply(msgId, chatId, `处理出错: ${err.message}`);
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
        console.log("[lark] ✅ WebSocket connected");
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

    async sendMessage(chatId: string, text: string) { await sendToChat(chatId, text); },
  };
}
