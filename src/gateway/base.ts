import type { IncomingMessage, ServerResponse } from "node:http";

export interface GatewayMessage {
  gateway: string;
  senderId: string;
  senderName?: string;
  chatId: string;
  text: string;
  raw?: unknown;
}

export interface GatewayAdapter {
  name: string;
  init(): Promise<void>;
  handleWebhook?(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  sendMessage(chatId: string, text: string): Promise<void>;
  broadcast?(text: string): Promise<void>;
}

export type OnMessage = (msg: GatewayMessage) => Promise<string>;

const adapters = new Map<string, GatewayAdapter>();

export function registerGateway(adapter: GatewayAdapter) {
  adapters.set(adapter.name, adapter);
}

export function getGateway(name: string): GatewayAdapter | undefined {
  return adapters.get(name);
}

export function allGateways(): GatewayAdapter[] {
  return [...adapters.values()];
}
