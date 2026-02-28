import OpenAI from "openai";
import type { ModelConfig } from "./config.js";

const clients = new Map<string, OpenAI>();

function getClient(model: ModelConfig): OpenAI {
  const key = `${model.provider}:${model.apiKey}:${model.baseUrl ?? ""}`;
  let c = clients.get(key);
  if (c) return c;
  const baseURL = model.baseUrl ?? (model.provider === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1");
  c = new OpenAI({ apiKey: model.apiKey, baseURL });
  clients.set(key, c);
  return c;
}

export type Message = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type ToolCall = { id: string; function: { name: string; arguments: string } };

export async function chatWithTools(
  modelConfig: ModelConfig, modelName: string, messages: Message[], tools?: ToolDef[]
): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  const client = getClient(modelConfig);
  const params: any = { model: modelName, messages, stream: false };
  if (tools?.length) params.tools = tools;
  const res = await client.chat.completions.create(params);
  const choice = res.choices[0];
  return {
    content: choice?.message?.content ?? null,
    toolCalls: (choice?.message?.tool_calls ?? []) as ToolCall[],
  };
}

export async function chat(modelConfig: ModelConfig, modelName: string, messages: Message[]): Promise<string> {
  const r = await chatWithTools(modelConfig, modelName, messages);
  return r.content ?? "";
}
