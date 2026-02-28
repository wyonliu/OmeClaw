import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const ENV_RE = /\$\{([A-Za-z_]\w*)\}/g;
function resolveEnv(v: unknown): unknown {
  if (typeof v === "string") return v.replace(ENV_RE, (_, k) => process.env[k] ?? "");
  if (Array.isArray(v)) return v.map(resolveEnv);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, resolveEnv(val)]));
  return v;
}

const AgentSchema = z.object({
  name: z.string(),
  model: z.string(),
  systemPrompt: z.string().default("You are a helpful assistant."),
  tools: z.array(z.string()).default([]),
  role: z.enum(["orchestrator", "worker", "specialist"]).default("worker"),
});

const ModelSchema = z.object({
  provider: z.enum(["anthropic", "openai", "openai-compatible"]),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
});

const LarkSchema = z.object({
  enabled: z.boolean().default(false),
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  verificationToken: z.string().optional(),
  encryptKey: z.string().optional(),
  allowFrom: z.array(z.string()).optional(),
});

const TelegramSchema = z.object({
  enabled: z.boolean().default(false),
  botToken: z.string().optional(),
  webhookUrl: z.string().optional(),
  allowFrom: z.array(z.string()).optional(),
});

const DiscordSchema = z.object({
  enabled: z.boolean().default(false),
  botToken: z.string().optional(),
  allowFrom: z.array(z.string()).optional(),
});

const CronJobSchema = z.object({
  name: z.string(),
  cron: z.string(),
  agent: z.string(),
  message: z.string(),
});

const MemorySchema = z.object({
  dataDir: z.string().default(".omeclaw"),
  compactThreshold: z.number().default(60),
}).default({ dataDir: ".omeclaw", compactThreshold: 60 });

export const ConfigSchema = z.object({
  gateways: z.object({
    lark: LarkSchema.optional(),
    telegram: TelegramSchema.optional(),
    discord: DiscordSchema.optional(),
  }).optional(),
  agents: z.record(z.string(), AgentSchema),
  models: z.record(z.string(), ModelSchema),
  scheduler: z.object({ enabled: z.boolean().default(false), jobs: z.array(CronJobSchema).default([]) }).optional(),
  memory: MemorySchema.optional(),
  runtime: z.object({ port: z.number().default(8080) }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type AgentConfig = z.infer<typeof AgentSchema>;
export type ModelConfig = z.infer<typeof ModelSchema>;

export function loadConfig(cwd: string, path = "config.yaml"): Config {
  const full = resolve(cwd, path);
  if (!existsSync(full)) throw new Error(`Config not found: ${full}`);
  const raw = readFileSync(full, "utf-8");
  const parsed = resolveEnv(parseYaml(raw));
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) throw new Error(`Config invalid: ${result.error.issues.map(i => i.message).join(", ")}`);
  const cfg = result.data;

  const lark = cfg.gateways?.lark;
  if (lark?.enabled) {
    if (!lark.verificationToken?.trim()) throw new Error("Lark gateway requires verificationToken");
    if (!lark.appId?.trim() || !lark.appSecret?.trim()) throw new Error("Lark gateway requires appId and appSecret");
  }
  const tg = cfg.gateways?.telegram;
  if (tg?.enabled && !tg.botToken?.trim()) throw new Error("Telegram gateway requires botToken");
  const dc = cfg.gateways?.discord;
  if (dc?.enabled && !dc.botToken?.trim()) throw new Error("Discord gateway requires botToken");

  for (const [id, agent] of Object.entries(cfg.agents)) {
    const modelId = agent.model.includes(":") ? agent.model.split(":")[0] : agent.model;
    if (!cfg.models[modelId]) throw new Error(`Agent "${id}" references unknown model "${modelId}"`);
  }
  return cfg;
}

export function loadEnv(cwd: string) {
  const p = resolve(cwd, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const m = line.trim().match(/^([A-Za-z_]\w*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
