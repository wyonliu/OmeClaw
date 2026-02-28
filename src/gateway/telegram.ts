import type { IncomingMessage, ServerResponse } from "node:http";
import type { Config } from "../config.js";
import type { GatewayAdapter, GatewayMessage, OnMessage } from "./base.js";

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => ok(buf));
    req.on("error", fail);
  });
}

export function createTelegramAdapter(config: Config, onMessage: OnMessage): GatewayAdapter | null {
  const tg = config.gateways?.telegram;
  if (!tg?.enabled) return null;

  const apiBase = `https://api.telegram.org/bot${tg.botToken}`;

  async function sendReply(chatId: string, text: string) {
    await fetch(`${apiBase}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  }

  return {
    name: "telegram",
    async init() {
      if (tg.webhookUrl) {
        await fetch(`${apiBase}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: `${tg.webhookUrl}/webhook/telegram` }),
        });
      }
    },
    async handleWebhook(req: IncomingMessage, res: ServerResponse) {
      if (!req.url?.startsWith("/webhook/telegram")) return false;
      const body = JSON.parse(await collectBody(req));
      res.writeHead(200); res.end("ok");

      const msg = body.message;
      if (!msg?.text) return true;

      const gmsg: GatewayMessage = {
        gateway: "telegram",
        senderId: String(msg.from.id),
        senderName: msg.from.first_name,
        chatId: String(msg.chat.id),
        text: msg.text,
        raw: body,
      };

      if (tg.allowFrom?.length && !tg.allowFrom.includes(gmsg.senderId)) return true;

      const reply = await onMessage(gmsg);
      await sendReply(gmsg.chatId, reply);
      return true;
    },
    async sendMessage(chatId: string, text: string) { await sendReply(chatId, text); },
  };
}
