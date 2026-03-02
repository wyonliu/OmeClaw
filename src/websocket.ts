// 实时同步系统 - WebSocket
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { createHash } from "node:crypto";

interface WSClient {
  id: string;
  socket: Duplex;
  sessionId: string;
  lastPing: number;
}

const clients = new Map<string, WSClient>();
let messageId = 0;

// WebSocket 握手
export function handleWebSocketUpgrade(req: IncomingMessage, socket: Duplex, _head: Buffer) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }

  const acceptKey = createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
    "\r\n"
  );

  const clientId = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const sessionId = new URL(req.url || "/", "http://localhost").searchParams.get("session") || "owner";

  const client: WSClient = {
    id: clientId,
    socket,
    sessionId,
    lastPing: Date.now(),
  };

  clients.set(clientId, client);
  console.log(`[ws] Client connected: ${clientId} (session: ${sessionId})`);

  // 发送欢迎消息
  sendToClient(clientId, {
    type: "connected",
    clientId,
    sessionId,
    timestamp: Date.now(),
  });

  // 处理消息
  socket.on("data", (buffer) => {
    try {
      const frames = parseWebSocketFrames(buffer);
      for (const frame of frames) {
        if (frame.opcode === 0x8) {
          // Close frame
          socket.end();
          clients.delete(clientId);
          console.log(`[ws] Client disconnected: ${clientId}`);
        } else if (frame.opcode === 0x9) {
          // Ping frame
          sendPong(socket, frame.payload);
        } else if (frame.opcode === 0x1 || frame.opcode === 0x2) {
          // Text or binary frame
          const message = JSON.parse(frame.payload.toString("utf-8"));
          handleClientMessage(clientId, message);
        }
      }
    } catch (e) {
      console.error("[ws] Error parsing frame:", e);
    }
  });

  socket.on("error", (err) => {
    console.error(`[ws] Socket error for ${clientId}:`, err);
    clients.delete(clientId);
  });

  socket.on("close", () => {
    clients.delete(clientId);
    console.log(`[ws] Client disconnected: ${clientId}`);
  });
}

// 解析 WebSocket 帧
function parseWebSocketFrames(buffer: Buffer): Array<{ opcode: number; payload: Buffer }> {
  const frames: Array<{ opcode: number; payload: Buffer }> = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;

    const byte1 = buffer[offset];
    const byte2 = buffer[offset + 1];

    const fin = (byte1 & 0x80) !== 0;
    const opcode = byte1 & 0x0f;
    const masked = (byte2 & 0x80) !== 0;
    let payloadLength = byte2 & 0x7f;

    offset += 2;

    if (payloadLength === 126) {
      if (buffer.length - offset < 2) break;
      payloadLength = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (buffer.length - offset < 8) break;
      payloadLength = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }

    let maskingKey: Buffer | undefined;
    if (masked) {
      if (buffer.length - offset < 4) break;
      maskingKey = buffer.subarray(offset, offset + 4);
      offset += 4;
    }

    if (buffer.length - offset < payloadLength) break;

    let payload = buffer.subarray(offset, offset + payloadLength);
    offset += payloadLength;

    if (maskingKey) {
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskingKey[i % 4];
      }
    }

    if (fin) {
      frames.push({ opcode, payload });
    }
  }

  return frames;
}

// 发送 WebSocket 帧
function sendFrame(socket: Duplex, opcode: number, payload: Buffer) {
  const payloadLength = payload.length;
  let header: Buffer;

  if (payloadLength < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x80 | opcode;
    header[1] = payloadLength;
  } else if (payloadLength < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payloadLength, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payloadLength), 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

function sendPong(socket: Duplex, payload: Buffer) {
  sendFrame(socket, 0xa, payload);
}

// 发送消息给客户端
export function sendToClient(clientId: string, data: any) {
  const client = clients.get(clientId);
  if (!client) return false;

  try {
    const payload = Buffer.from(JSON.stringify(data), "utf-8");
    sendFrame(client.socket, 0x1, payload);
    return true;
  } catch (e) {
    console.error(`[ws] Error sending to ${clientId}:`, e);
    return false;
  }
}

// 广播消息给所有客户端
export function broadcast(data: any, filter?: (client: WSClient) => boolean) {
  let sent = 0;
  for (const client of clients.values()) {
    if (filter && !filter(client)) continue;
    if (sendToClient(client.id, data)) sent++;
  }
  return sent;
}

// 发送给特定会话的所有客户端
export function broadcastToSession(sessionId: string, data: any) {
  return broadcast(data, (client) => client.sessionId === sessionId);
}

// 处理客户端消息
function handleClientMessage(clientId: string, message: any) {
  const client = clients.get(clientId);
  if (!client) return;

  console.log(`[ws] Message from ${clientId}:`, message.type);

  switch (message.type) {
    case "ping":
      client.lastPing = Date.now();
      sendToClient(clientId, { type: "pong", timestamp: Date.now() });
      break;

    case "subscribe":
      // 订阅特定事件
      sendToClient(clientId, { type: "subscribed", events: message.events });
      break;

    default:
      console.warn(`[ws] Unknown message type: ${message.type}`);
  }
}

// 推送事件
export function pushEvent(event: {
  type: string;
  data: any;
  sessionId?: string;
  timestamp?: number;
}) {
  const message = {
    id: ++messageId,
    ...event,
    timestamp: event.timestamp || Date.now(),
  };

  if (event.sessionId) {
    return broadcastToSession(event.sessionId, message);
  } else {
    return broadcast(message);
  }
}

// 获取连接统计
export function getWSStats() {
  return {
    totalClients: clients.size,
    clientsBySessions: Array.from(clients.values()).reduce((acc, client) => {
      acc[client.sessionId] = (acc[client.sessionId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };
}

// 心跳检测
setInterval(() => {
  const now = Date.now();
  for (const [clientId, client] of clients.entries()) {
    if (now - client.lastPing > 60000) {
      console.log(`[ws] Client timeout: ${clientId}`);
      client.socket.end();
      clients.delete(clientId);
    }
  }
}, 30000);
