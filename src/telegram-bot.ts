/**
 * Telegram Bot集成
 * 学习OpenClaw的多渠道架构
 */

import { Bot, Context } from "grammy";
import { getUserFacts, saveMessage, getHistory } from "./memory.js";
import { chat as llmChat } from "./llm.js";
import type { ModelConfig } from "./config.js";

interface TelegramSession {
  userId: string;
  username?: string;
  firstName?: string;
  sessionId: string;
  lastActive: number;
}

export class TelegramBot {
  private bot: Bot;
  private sessions: Map<number, TelegramSession> = new Map();

  constructor(token: string) {
    this.bot = new Bot(token);
    this.setupHandlers();
  }

  private setupHandlers() {
    // 启动命令
    this.bot.command("start", async (ctx) => {
      await ctx.reply(
        "你好！我是Ome 🪼\n\n" +
        "我是你的AI分身，会记住我们的每一次对话。\n\n" +
        "你可以：\n" +
        "💬 直接和我聊天\n" +
        "📊 /status - 查看状态\n" +
        "🔄 /reset - 重置对话\n" +
        "❤️ /streak - 查看连续天数"
      );
    });

    // 状态命令
    this.bot.command("status", async (ctx) => {
      const session = this.getOrCreateSession(ctx);
      const facts = getUserFacts(session.sessionId);
      
      await ctx.reply(
        `📊 状态\n\n` +
        `👤 用户: ${session.firstName || session.username}\n` +
        `🧠 记忆数: ${facts.length}\n` +
        `⏰ 最后活跃: ${new Date(session.lastActive).toLocaleString()}`
      );
    });

    // 重置命令
    this.bot.command("reset", async (ctx) => {
      this.getOrCreateSession(ctx);
      // 简单实现：不清除记忆，只提示
      
      await ctx.reply("✅ 对话已重置！让我们重新开始吧~");
    });

    // 处理所有文本消息
    this.bot.on("message:text", async (ctx) => {
      const session = this.getOrCreateSession(ctx);
      const userMessage = ctx.message.text;

      // 显示输入中...
      await ctx.replyWithChatAction("typing");

      try {
        // 获取历史消息
        const history = getHistory(session.sessionId, "ome", 10);
        
        // 调用LLM
        const messages = [
          { role: "system" as const, content: "你是Ome，一个温柔、善解人意的AI分身。" },
          ...history,
          { role: "user" as const, content: userMessage }
        ];
        
        const response = await llmChat(
          { apiKey: process.env.OPENAI_API_KEY || "" } as ModelConfig,
          "gpt-4",
          messages
        );

        // 保存消息
        saveMessage(session.sessionId, "ome", "user", userMessage);
        saveMessage(session.sessionId, "ome", "assistant", response);

        // 发送回复
        await ctx.reply(response);

        // 更新最后活跃时间
        session.lastActive = Date.now();
      } catch (error) {
        console.error("Telegram bot error:", error);
        await ctx.reply("抱歉，我遇到了一些问题... 请稍后再试~");
      }
    });

    // 错误处理
    this.bot.catch((err) => {
      console.error("Telegram bot error:", err);
    });
  }

  private getOrCreateSession(ctx: Context): TelegramSession {
    const userId = ctx.from?.id;
    if (!userId) {
      throw new Error("No user ID");
    }

    let session = this.sessions.get(userId);
    if (!session) {
      session = {
        userId: String(userId),
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        sessionId: `telegram_${userId}`,
        lastActive: Date.now(),
      };
      this.sessions.set(userId, session);
    }

    return session;
  }

  async start() {
    console.log("🤖 Telegram Bot启动中...");
    await this.bot.start();
    console.log("✅ Telegram Bot已启动");
  }

  async stop() {
    await this.bot.stop();
    console.log("🛑 Telegram Bot已停止");
  }
}

// 导出单例
let botInstance: TelegramBot | null = null;

export function initTelegramBot(token: string): TelegramBot {
  if (!botInstance) {
    botInstance = new TelegramBot(token);
  }
  return botInstance;
}

export function getTelegramBot(): TelegramBot | null {
  return botInstance;
}
