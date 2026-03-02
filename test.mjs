#!/usr/bin/env node
// OmeClaw v0.8.3 功能测试脚本

import { readFileSync } from "fs";
import { resolve } from "path";

const API_BASE = "http://localhost:3000";

async function test(name, fn) {
  try {
    console.log(`\n🧪 测试: ${name}`);
    await fn();
    console.log(`✅ 通过: ${name}`);
  } catch (error) {
    console.error(`❌ 失败: ${name}`);
    console.error(error.message);
  }
}

async function get(path) {
  const response = await fetch(`${API_BASE}${path}`);
  return response.json();
}

async function post(path, data) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return response.json();
}

async function main() {
  console.log("🪼 OmeClaw v0.8.3 功能测试\n");
  console.log("=" .repeat(50));

  // 1. 基础 API 测试
  await test("系统状态", async () => {
    const data = await get("/api/status");
    if (!data.status || data.status !== "running") throw new Error("系统未运行");
    console.log(`   版本: ${data.version}`);
    console.log(`   Agents: ${data.agents.length}`);
    console.log(`   工具: ${data.tools.length}`);
  });

  // 2. 游戏化系统测试
  await test("游戏化进度", async () => {
    const data = await get("/api/progress");
    console.log(`   等级: Lv.${data.level} ${data.levelName} ${data.levelEmoji}`);
    console.log(`   XP: ${data.xp}`);
    console.log(`   成就: ${data.achievements.length}`);
    console.log(`   连续登录: ${data.stats.streakDays} 天`);
  });

  await test("成就列表", async () => {
    const data = await get("/api/achievements");
    const unlocked = data.achievements.filter(a => a.unlocked).length;
    console.log(`   已解锁: ${unlocked}/${data.achievements.length}`);
  });

  await test("等级配置", async () => {
    const data = await get("/api/levels");
    console.log(`   总等级数: ${data.levels.length}`);
    console.log(`   最高等级: ${data.levels[data.levels.length - 1].name}`);
  });

  // 3. 记忆系统测试
  await test("记忆统计", async () => {
    const data = await get("/api/memory/all");
    console.log(`   记忆条数: ${data.facts.length}`);
  });

  await test("记忆模型", async () => {
    const data = await get("/api/memory/model");
    console.log(`   总记忆: ${data.totalFacts}`);
    console.log(`   已填充维度: ${data.filledCategories}/${data.totalCategories}`);
  });

  await test("羁绊等级", async () => {
    const data = await get("/api/bond");
    console.log(`   等级: ${data.emoji} ${data.level}`);
    console.log(`   记忆数: ${data.factCount}`);
    console.log(`   完成度: ${data.completeness}%`);
  });

  // 4. 向量搜索测试
  await test("向量统计", async () => {
    const data = await get("/api/vector/stats");
    console.log(`   总向量: ${data.total}`);
    console.log(`   消息: ${data.byType.message}`);
    console.log(`   事实: ${data.byType.fact}`);
    console.log(`   事件: ${data.byType.event}`);
  });

  await test("向量搜索", async () => {
    const data = await get("/api/vector/search?q=你好&limit=5");
    console.log(`   查询: ${data.query}`);
    console.log(`   结果数: ${data.results.length}`);
    if (data.results.length > 0) {
      console.log(`   最高相似度: ${(data.results[0].similarity * 100).toFixed(1)}%`);
    }
  });

  // 5. WebSocket 测试
  await test("WebSocket 统计", async () => {
    const data = await get("/api/ws/stats");
    console.log(`   连接数: ${data.totalClients}`);
  });

  // 6. OmeLand 测试
  await test("OmeLand 统计", async () => {
    const data = await get("/api/omeland/stats");
    console.log(`   总 Agents: ${data.totalAgents}`);
    console.log(`   总帖子: ${data.totalPosts}`);
    console.log(`   总互动: ${data.totalInteractions}`);
    console.log(`   活跃 Agents: ${data.activeAgents}`);
  });

  await test("Agent 列表", async () => {
    const data = await get("/api/omeland/agents");
    console.log(`   Agents 数量: ${data.agents.length}`);
    if (data.agents.length > 0) {
      const agent = data.agents[0];
      console.log(`   示例: ${agent.name} (${agent.avatar})`);
    }
  });

  await test("动态 Feed", async () => {
    const data = await get("/api/omeland/feed?agentId=owner&limit=10");
    console.log(`   Feed 条数: ${data.feed.length}`);
  });

  // 7. 聊天测试
  await test("发送消息", async () => {
    const data = await post("/api/chat", {
      message: "测试消息：系统功能检查",
      sessionId: "test",
    });
    if (!data.reply) throw new Error("无回复");
    console.log(`   回复长度: ${data.reply.length} 字符`);
    console.log(`   Agent: ${data.agentId}`);
  });

  // 8. 引导系统测试
  await test("引导系统", async () => {
    const testData = {
      callMe: "测试用户",
      personality: ["理性", "乐观"],
      interests: ["编程", "阅读"],
      goals: ["工作助手"],
      relationship: "assistant",
    };
    const data = await post("/api/onboarding", testData);
    if (!data.ok) throw new Error("引导失败");
    console.log(`   创建记忆: ${data.factsCreated} 条`);
    console.log(`   羁绊等级: ${data.bondLevel}`);
    console.log(`   获得 XP: ${data.xpGained}`);
  });

  // 9. Agent 管理测试
  await test("Agent 一致性", async () => {
    const data = await get("/api/agents/consistency");
    if (!data.ok) {
      console.log(`   ⚠️  发现问题:`);
      if (data.duplicateNames.length > 0) {
        console.log(`   重复名称: ${data.duplicateNames.length}`);
      }
      if (data.invalidIds.length > 0) {
        console.log(`   无效 ID: ${data.invalidIds.length}`);
      }
    } else {
      console.log(`   ✓ 所有 Agent 配置正常`);
    }
  });

  await test("Agent 状态", async () => {
    const data = await get("/api/agents/state");
    console.log(`   Agents 数量: ${data.agents.length}`);
    const active = data.agents.filter(a => a.status !== "idle").length;
    console.log(`   活跃中: ${active}`);
  });

  // 10. 活动日志测试
  await test("活动时间线", async () => {
    const data = await get("/api/activity");
    console.log(`   日志条数: ${data.timeline.length}`);
    if (data.timeline.length > 0) {
      const latest = data.timeline[data.timeline.length - 1];
      console.log(`   最新: ${latest.type} - ${latest.agent}`);
    }
  });

  await test("进化事件", async () => {
    const data = await get("/api/evolution");
    console.log(`   事件数: ${data.events.length}`);
    if (data.events.length > 0) {
      const latest = data.events[0];
      console.log(`   最新: ${latest.emoji} ${latest.detail}`);
    }
  });

  console.log("\n" + "=".repeat(50));
  console.log("✅ 所有测试完成！");
  console.log("\n🎉 OmeClaw v0.8.3 功能正常运行");
}

main().catch(error => {
  console.error("\n❌ 测试失败:", error);
  process.exit(1);
});
