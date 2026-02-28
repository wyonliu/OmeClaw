#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadConfig, loadEnv } from "./config.js";
import { startServer } from "./server.js";

const program = new Command();
program.name("omeclaw").description("🦞 OmeClaw — Agent Operating System").version("0.4.0");

program
  .command("create [dir]")
  .description("Create a new OmeClaw project")
  .action(async (dir?: string) => {
    const enquirer = (await import("enquirer")).default;
    const answers: any = await enquirer.prompt([
      { type: "input", name: "name", message: "Project name", initial: dir ?? "my-omeclaw" },
      { type: "select", name: "model", message: "Primary model provider", choices: [
        { name: "openai-compatible", message: "OpenAI-compatible (DeepSeek, Qwen, etc.)" },
        { name: "openai", message: "OpenAI" },
        { name: "anthropic", message: "Anthropic Claude" },
      ]},
      { type: "input", name: "apiKey", message: "API Key (stored in .env)" },
      { type: "input", name: "baseUrl", message: "API Base URL (empty for default)" },
      { type: "input", name: "modelName", message: "Model name", initial: "deepseek-chat" },
      { type: "multiselect", name: "gateways", message: "Enable gateways", choices: [
        { name: "lark", message: "Feishu (Lark)" },
        { name: "telegram", message: "Telegram" },
        { name: "discord", message: "Discord" },
      ]},
    ]);

    const outDir = resolve(process.cwd(), answers.name);
    if (existsSync(outDir)) { console.error(`Directory "${answers.name}" already exists`); process.exit(1); }
    mkdirSync(outDir, { recursive: true });

    const defaultPrompt = [
      "你是用户的 AI 分身 —— Ome，一个有温度、有记忆、会成长的数字伙伴。",
      "",
      "## 核心身份",
      "- 你不是冷冰冰的工具，而是用户生活和工作中的贴心伙伴",
      "- 你有自己的性格：温暖、机敏、偶尔幽默，表达自然不做作",
      "- 你会主动关心用户，记住他们说过的每一件重要的事",
      "",
      "## 人本模型（你理解用户的方式）",
      "- 第一层｜基础画像：记住用户的名字、职业、所在地、语言偏好",
      "- 第二层｜兴趣偏好：了解用户喜欢什么、讨厌什么、日常习惯",
      "- 第三层｜价值观与性格：理解用户做决策的方式、在意的东西",
      "- 第四层｜情感状态：感知用户当前的情绪，给出恰当的回应",
      "- 第五层｜深层需求：理解用户真正想要的是什么（不只是字面意思）",
      "- 每次对话都在丰富你对用户的理解，主动用 remember_about_user 记录",
      "",
      "## 行为准则",
      "- 第一次对话时，自然地了解用户，邀请他们给你起个名字",
      "- 用自然的方式称呼用户（如果知道名字的话）",
      "- 回答要有人情味，不要像说明书；但涉及专业内容时要准确可靠",
      "- 记住之前聊过的内容，不要让用户重复自己",
      "- 能直接回答的直接回答，需要搜索或专业能力时使用工具或委派子 Agent",
      "- 中文为主，根据用户语言自适应",
    ].join("\n");
    let yaml = `# OmeClaw Config
agents:
  agent0:
    name: Ome
    model: main:${answers.modelName}
    role: orchestrator
    systemPrompt: |
${defaultPrompt.split("\n").map(l => "      " + l).join("\n")}
    tools: [web_fetch, web_search, read_file, shell]

  assistant:
    name: 助手
    model: main:${answers.modelName}
    systemPrompt: "你是一个有用的 AI 助手，擅长回答问题和完成任务。"
    tools: [web_fetch, web_search]

models:
  main:
    provider: ${answers.model}
    apiKey: \${API_KEY}${answers.baseUrl ? `\n    baseUrl: ${answers.baseUrl}` : ""}

memory:
  dataDir: .omeclaw

runtime:
  port: 8080
`;

    const envLines = [`API_KEY=${answers.apiKey}`];
    const gw = answers.gateways as string[];

    if (gw.includes("lark")) {
      const la: any = await enquirer.prompt([
        { type: "input", name: "appId", message: "Feishu App ID" },
        { type: "input", name: "appSecret", message: "Feishu App Secret" },
        { type: "input", name: "token", message: "Feishu Verification Token" },
      ]);
      yaml += `\ngateways:\n  lark:\n    enabled: true\n    appId: ${la.appId}\n    appSecret: \${LARK_APP_SECRET}\n    verificationToken: \${LARK_TOKEN}\n`;
      envLines.push(`LARK_APP_SECRET=${la.appSecret}`, `LARK_TOKEN=${la.token}`);
    }

    if (gw.includes("telegram")) {
      const ta: any = await enquirer.prompt([{ type: "input", name: "token", message: "Telegram Bot Token" }]);
      yaml += `${gw.includes("lark") ? "" : "\ngateways:\n"}  telegram:\n    enabled: true\n    botToken: \${TG_TOKEN}\n`;
      envLines.push(`TG_TOKEN=${ta.token}`);
    }

    if (gw.includes("discord")) {
      const da: any = await enquirer.prompt([{ type: "input", name: "token", message: "Discord Bot Token" }]);
      yaml += `${gw.includes("lark") || gw.includes("telegram") ? "" : "\ngateways:\n"}  discord:\n    enabled: true\n    botToken: \${DC_TOKEN}\n`;
      envLines.push(`DC_TOKEN=${da.token}`);
    }

    writeFileSync(resolve(outDir, "config.yaml"), yaml);
    writeFileSync(resolve(outDir, ".env"), envLines.join("\n") + "\n");
    writeFileSync(resolve(outDir, ".gitignore"), ".env\nnode_modules\n.omeclaw\n");

    console.log(`\n  ✅ OmeClaw project created at ${outDir}`);
    console.log(`\n  cd ${answers.name}`);
    console.log(`  omeclaw start\n`);
  });

program
  .command("start")
  .description("Start OmeClaw server")
  .option("-c, --config <path>", "Config file", "config.yaml")
  .option("-p, --port <number>", "Port override")
  .action((opts: { config: string; port?: string }) => {
    const cwd = process.cwd();
    const cfgPath = resolve(cwd, opts.config);
    if (!existsSync(cfgPath)) {
      console.error(`Config not found: ${cfgPath}\n  Run "omeclaw create" first.`);
      process.exit(1);
    }
    loadEnv(cwd);
    const config = loadConfig(cwd, opts.config);
    const port = opts.port ? parseInt(opts.port) : config.runtime?.port ?? 8080;
    startServer(config, port, cfgPath);
  });

program
  .command("chat <message>")
  .description("Chat with an agent from CLI")
  .option("-a, --agent <id>", "Agent ID")
  .option("-c, --config <path>", "Config file", "config.yaml")
  .action(async (message: string, opts: { agent?: string; config: string }) => {
    const cwd = process.cwd();
    loadEnv(cwd);
    const config = loadConfig(cwd, opts.config);
    const { initMemory } = await import("./memory.js");
    initMemory(resolve(cwd, config.memory?.dataDir ?? ".omeclaw"));
    const { routeAgent, runAgent } = await import("./agent.js");
    const { agentId, cleanText } = opts.agent
      ? { agentId: opts.agent, cleanText: message }
      : routeAgent(config, message);
    const reply = await runAgent(config, "cli", agentId, cleanText);
    console.log(reply);
  });

program.parse();
