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

  async function sendMsg(chatId: string, openId: string, text: string): Promise<boolean> {
    if (text.length > LARK_MSG_MAX) text = text.slice(0, LARK_MSG_MAX) + "\n\n...(内容过长已截断)";
    const content = JSON.stringify({ text });

    // 优先用 chat_id 发送
    if (chatId) {
      try {
        await client.im.message.create({
          params: { receive_id_type: "chat_id" },
          data: { receive_id: chatId, msg_type: "text", content },
        });
        console.log(`[lark] ✉ sent via chat_id (${text.length} chars)`);
        return true;
      } catch (err: any) {
        console.warn(`[lark] chat_id send failed: ${err.message}`);
      }
    }

    // 备用：用 open_id 发送
    if (openId) {
      try {
        await client.im.message.create({
          params: { receive_id_type: "open_id" },
          data: { receive_id: openId, msg_type: "text", content },
        });
        console.log(`[lark] ✉ sent via open_id (${text.length} chars)`);
        return true;
      } catch (err: any) {
        console.error(`[lark] open_id send failed: ${err.message}`);
      }
    }

    console.error("[lark] 发送全部失败！检查飞书权限: im:message, im:message:send_as_bot, contact:user.id:readonly");
    return false;
  }

  async function processMessage(eventData: any) {
    const msgId = eventData.message?.message_id;
    if (!msgId || dedup(msgId)) return;

    const senderId = eventData.sender?.sender_id?.open_id ?? "";
    const chatId = eventData.message?.chat_id ?? "";

    if (!senderId) { console.warn("[lark] 无 sender open_id"); return; }
    if (allowList.length && !allowList.includes(senderId)) return;
    if (!rateCheck(senderId)) {
      await sendMsg(chatId, senderId, "请求过于频繁，请稍后再试");
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

    const gwMsg: GatewayMessage = { gateway: "lark", senderId, chatId: chatId || senderId, text };
    try {
      const t0 = Date.now();
      const reply = await withTimeout(onMessage(gwMsg), PROCESS_TIMEOUT_MS, "处理超时，请稍后重试。");
      console.log(`[lark] → reply ready (${reply.length} chars, ${Date.now() - t0}ms)`);
      await sendMsg(chatId, senderId, reply);
    } catch (err: any) {
      console.error("[lark] 处理异常:", err);
      await sendMsg(chatId, senderId, `处理出错: ${err.message}`);
    }
  }

  return {
    name: "lark",
    async init() {
      try {
        const LarkModule = Lark as any;
        if (typeof LarkModule.WSClient !== "function") throw new Error("WSClient not available");

        const dispatcher = new Lark.EventDispatcher({ verificationToken: verifyToken }).register({
          "im.message.receive_v1": (data: any) => {
            // 不 await —— 立即返回空字符串防止 SDK 自动回复
            void processMessage(data).catch(e => console.error("[lark] handler error:", e));
            return "";
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

    async sendMessage(chatId: string, text: string) { await sendMsg(chatId, "", text); },
  };
}
