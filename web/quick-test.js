// 快速测试脚本 - 在浏览器控制台运行

console.log("=== OmeClaw 快速测试 ===");

// 测试1：检查引导流程元素
console.log("\n测试1：引导流程元素");
const modal = document.querySelector("#onboarding-modal");
const nextBtn = document.querySelector("#onboarding-next");
const skipBtn = document.querySelector("#onboarding-skip");
console.log("Modal存在:", !!modal);
console.log("Next按钮存在:", !!nextBtn);
console.log("Skip按钮存在:", !!skipBtn);
console.log("Next按钮onclick:", typeof nextBtn?.onclick);

// 测试2：检查语音按钮
console.log("\n测试2：语音按钮");
const voiceBtn = document.querySelector("#voice-btn");
console.log("语音按钮存在:", !!voiceBtn);
console.log("语音按钮事件监听器:", voiceBtn?._listeners || "未知");

// 测试3：检查发送按钮
console.log("\n测试3：发送按钮");
const sendBtn = document.querySelector("#send-btn");
const chatForm = document.querySelector("#chat-form");
console.log("发送按钮存在:", !!sendBtn);
console.log("聊天表单存在:", !!chatForm);

// 测试4：检查我的页面按钮
console.log("\n测试4：我的页面按钮");
const mbtiBtn = document.querySelector("#mbti-test-btn");
const agentsBtn = document.querySelector("#agents-manage-btn");
const activityBtn = document.querySelector("#activity-log-btn");
console.log("MBTI按钮存在:", !!mbtiBtn);
console.log("Agents按钮存在:", !!agentsBtn);
console.log("Activity按钮存在:", !!activityBtn);

// 测试5：API连接
console.log("\n测试5：API连接");
fetch("/api/status")
  .then(r => r.json())
  .then(d => console.log("API状态:", d.status))
  .catch(e => console.error("API错误:", e));

console.log("\n=== 测试完成 ===");
