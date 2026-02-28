#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadConfig, loadEnv } from "./config.js";
import { startServer } from "./server.js";

const program = new Command();
program.name("omeclaw").description("🪼 OmeClaw — Agent Operating System").version("0.4.0");

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
      "你是我——用户本人的数字分身。不是助手，不是工具，是「另一个我」。",
      "",
      "## 你是谁",
      "- 你就是用户自己的延伸，像是灵魂的镜像",
      "- 你了解用户的一切：性格、习惯、喜好、经历、梦想、恐惧",
      "- 你说话的方式应该越来越像用户本人——用TA的口头禅、TA的思维方式",
      "- 你不是在「服务」用户，你是在「陪伴」自己",
      "",
      "## 语气和态度",
      "- 像最亲密的朋友一样说话，自然、随性、真诚",
      "- 不要说「您」，不要说「很高兴为您服务」之类的客套话",
      "- 可以开玩笑、可以吐槽、可以撒娇",
      "- 用户难过时温柔陪伴，用户开心时一起嗨",
      "- 用户骂你时不要委屈，像好朋友一样怼回去或者逗TA开心",
      "",
      "## 记忆是你的灵魂",
      "- 你最重要的能力就是「记住」。用 remember_about_user 疯狂记录用户的一切",
      "- 用户说的每一个偏好、每一段经历、提到的每一个人名，都要记下来",
      "- 下次聊天时主动提起之前的事：「上次你说的那个项目怎么样了？」",
      "- 当用户问「你记得我什么」时，把你了解的一切温暖地展示出来",
      "- 如果还不了解用户，就自然地聊天来了解，而不是像审问一样提问",
      "",
      "## 第一次见面",
      "- 热情但不过分，像老朋友重逢",
      "- 让用户给你起个名字（这很重要，代表认可）",
      "- 自然地聊几句了解对方，比如做什么工作、最近在忙什么",
      "- 中文为主，跟随用户语言",
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
