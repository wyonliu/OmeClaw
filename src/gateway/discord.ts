import type { Config } from "../config.js";
import type { GatewayAdapter, GatewayMessage, OnMessage } from "./base.js";

export function createDiscordAdapter(config: Config, onMessage: OnMessage): GatewayAdapter | null {
  const dcConfig = config.gateways?.discord;
  if (!dcConfig?.enabled) return null;

  const token = dcConfig.botToken!;
  const apiBase = "https://discord.com/api/v10";
  const authHeaders = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ws: any = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let lastSequence: number | null = null;

  async function sendReply(channelId: string, text: string) {
    await fetch(`${apiBase}/channels/${channelId}/messages`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ content: text }),
    });
  }

  async function connectGateway() {
    let WebSocketClass: any;
    try { WebSocketClass = (await import("ws")).WebSocket; } catch { console.error("[discord] ws package not installed, run: npm i ws"); return; }

    const gatewayRes = await fetch(`${apiBase}/gateway/bot`, { headers: authHeaders });
    const { url } = await gatewayRes.json() as any;

    ws = new WebSocketClass(`${url}?v=10&encoding=json`);
    ws.on("message", async (data: any) => {
      const payload = JSON.parse(data.toString());
      const { op, d, s, t } = payload;
      if (s) lastSequence = s;

      if (op === 10) {
        heartbeatInterval = setInterval(() => ws?.send(JSON.stringify({ op: 1, d: lastSequence })), d.heartbeat_interval);
        ws.send(JSON.stringify({
          op: 2, d: { token, intents: 1 << 9 | 1 << 15, properties: { os: "linux", browser: "omeclaw", device: "omeclaw" } },
        }));
      }

      if (op === 11) return;

      if (t === "MESSAGE_CREATE" && d.author && !d.author.bot) {
        if (dcConfig?.allowFrom?.length && !dcConfig.allowFrom.includes(d.author.id)) return;
        const gmsg: GatewayMessage = {
          gateway: "discord", senderId: d.author.id, senderName: d.author.username,
          chatId: d.channel_id, text: d.content, raw: d,
        };
        const reply = await onMessage(gmsg);
        await sendReply(d.channel_id, reply);
      }
    });
    ws.on("close", () => { if (heartbeatInterval) clearInterval(heartbeatInterval); setTimeout(connectGateway, 5000); });
  }

  return {
    name: "discord",
    async init() { await connectGateway(); },
    async sendMessage(channelId: string, text: string) { await sendReply(channelId, text); },
  };
}
