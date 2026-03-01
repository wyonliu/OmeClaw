// ========== 全局变量 ==========
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const OWNER_SESSION = "owner";
let currentView = "chat";
let currentAgent = "";
let agents = [];
let ttsEnabled = false;
let isRecording = false;
let recognition = null;
let lastMsgId = 0;

// ========== 工具函数 ==========
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatMsg(text) {
  let s = esc(text);
  s = s.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

function showToast(msg, type = "info") {
  const container = $("#toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "toastSlide .3s reverse";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ========== 导航 ==========
function switchView(view) {
  currentView = view;
  $$(".view").forEach(v => v.classList.remove("active"));
  $$(".nav-tab").forEach(t => t.classList.remove("active"));
  $(`#view-${view}`)?.classList.add("active");
  $(`.nav-tab[data-view="${view}"]`)?.classList.add("active");
  localStorage.setItem("omeclaw_view", view);
  
  if (view === "chat") loadChatHistory();
  if (view === "memory") loadMemory();
  if (view === "grow") loadGrow();
}

$$(".nav-tab").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function goBack() {
  $$(".subview.active").forEach(v => v.classList.remove("active"));
}

// ========== 聊天 ==========
async function loadChatHistory() {
  try {
    const resp = await fetch(`/api/chat/history?merged=1`);
    const { messages } = await resp.json();
    const container = $("#messages");
    
    if (!messages || !messages.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:var(--text2)">
          <div style="font-size:48px;margin-bottom:16px">🪼</div>
          <h3 style="font-size:20px;margin-bottom:8px">嘿 👋</h3>
          <p style="font-size:15px;line-height:1.6">我还没名字呢，你给我起一个？<br>然后跟我聊聊你，让我知道我是谁的分身。</p>
        </div>`;
      return;
    }
    
    container.innerHTML = "";
    for (const m of messages) {
      addMsg(m.role, m.role === "user" ? esc(m.content) : formatMsg(m.content));
    }
    container.scrollTop = container.scrollHeight;
    if (messages.length) lastMsgId = messages[messages.length - 1].id || 0;
  } catch (e) {
    console.error("loadChatHistory:", e);
  }
}

function addMsg(role, html) {
  const container = $("#messages");
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = html;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return;
  
  input.value = "";
  addMsg("user", esc(text));
  
  const thinkingMsg = addMsg("assistant", '<div class="thinking-dots"><span></span><span></span><span></span></div>');
  thinkingMsg.classList.add("thinking");
  
  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId: OWNER_SESSION, agentId: currentAgent })
    });
    const data = await resp.json();
    
    thinkingMsg.remove();
    
    if (data.error) {
      addMsg("assistant", `<span style="color:var(--red)">错误: ${esc(data.error)}</span>`);
    } else {
      addMsg("assistant", formatMsg(data.reply || "无回复"));
      if (ttsEnabled && data.reply) speak(data.reply);
    }
  } catch (err) {
    thinkingMsg.remove();
    addMsg("assistant", `<span style="color:var(--red)">网络错误: ${esc(err.message)}</span>`);
  }
  
  setTimeout(checkMemoryUpdate, 800);
  setTimeout(loadBond, 1000);
});

// ========== 语音 ==========
function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  $("#tts-toggle").textContent = ttsEnabled ? "🔊" : "🔇";
  showToast(ttsEnabled ? "语音播报已开启" : "语音播报已关闭", "info");
}

function speak(text) {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 1.1;
  speechSynthesis.speak(utterance);
}

function toggleVoice() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  if (!window.webkitSpeechRecognition && !window.SpeechRecognition) {
    showToast("浏览器不支持语音识别", "error");
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = false;
  
  recognition.onstart = () => {
    isRecording = true;
    $("#voice-btn").classList.add("recording");
  };
  
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    $("#chat-input").value = transcript;
    $("#chat-form").requestSubmit();
  };
  
  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    stopRecording();
  };
  
  recognition.onend = () => {
    stopRecording();
  };
  
  recognition.start();
}

function stopRecording() {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
  isRecording = false;
  $("#voice-btn").classList.remove("recording");
}

// ========== 记忆 ==========
async function loadMemory() {
  try {
    const data = await (await fetch("/api/memory/model")).json();
    renderMemoryPlanet(data);
    renderMemoryCategories(data);
  } catch (e) {
    console.error("loadMemory:", e);
  }
}

function renderMemoryPlanet(data) {
  const canvas = $("#memory-planet");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = 120;
  
  ctx.clearRect(0, 0, w, h);
  
  // 背景星空
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  
  // 主星球
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradient.addColorStop(0, "#7c6cf0");
  gradient.addColorStop(1, "#4d9fff");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  
  // 11层记忆星星
  const categories = data.categories || [];
  const angleStep = (Math.PI * 2) / 11;
  categories.forEach((cat, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const x = cx + Math.cos(angle) * (r + 30);
    const y = cy + Math.sin(angle) * (r + 30);
    
    ctx.fillStyle = cat.filled ? "#00d47b" : "#2a2a3a";
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    
    if (cat.filled) {
      ctx.strokeStyle = "#00d47b";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  });
  
  $("#memory-pct").textContent = `${data.totalFacts ? Math.round(data.filledCategories / data.totalCategories * 100) : 0}%`;
  $("#memory-count").textContent = data.totalFacts || 0;
  $("#memory-layers").textContent = `${data.filledCategories || 0}/11`;
}

function renderMemoryCategories(data) {
  const container = $("#memory-categories");
  if (!container) return;
  
  const categories = data.categories || [];
  container.innerHTML = categories.map(cat => `
    <div class="mem-cat ${cat.filled ? 'filled' : ''}">
      <div class="mem-cat-header">
        <span class="mem-cat-icon">${cat.icon}</span>
        <span class="mem-cat-name">${esc(cat.name)}</span>
        ${cat.filled ? `<span class="mem-cat-count">${cat.facts.length}</span>` : ''}
      </div>
      ${cat.filled ? cat.facts.map(f => `
        <div class="mem-fact">
          <span class="mem-fact-key">${esc(f.key)}</span>
          <span class="mem-fact-val">${esc(f.value)}</span>
        </div>
      `).join('') : '<p style="font-size:13px;color:var(--text2);font-style:italic">还没聊到这个方面</p>'}
    </div>
  `).join('');
}

// ========== 养成 ==========
async function loadGrow() {
  try {
    const bond = await (await fetch("/api/bond")).json();
    $("#grow-avatar").textContent = bond.emoji || "🪼";
    $("#grow-name").textContent = bond.myName || "小O";
    $("#grow-level").textContent = bond.level || "初见";
    
    const progress = bond.progressToNext || 0;
    $("#bond-fill").style.width = `${progress}%`;
    $("#bond-xp").textContent = `${bond.xp || 0} XP`;
    $("#bond-next").textContent = bond.nextMilestone ? `→ ${bond.nextMilestone.emoji} ${bond.nextMilestone.name} (${bond.nextMilestone.xp} XP)` : "已满级";
    
    const streak = parseInt(localStorage.getItem("omeclaw_streak") || "0");
    $("#streak-num").textContent = streak;
    
    renderAchievements(bond);
    renderTasks();
  } catch (e) {
    console.error("loadGrow:", e);
  }
}

function renderAchievements(bond) {
  const achievements = [
    { id: "first", name: "初次记忆", emoji: "🌱", threshold: 1 },
    { id: "five", name: "初识", emoji: "🪼", threshold: 5 },
    { id: "ten", name: "渐熟", emoji: "💙", threshold: 10 },
    { id: "twenty", name: "知己", emoji: "💎", threshold: 20 },
    { id: "fifty", name: "灵魂伴侣", emoji: "🌊", threshold: 50 },
  ];
  
  const container = $("#achievements-grid");
  const factCount = bond.factCount || 0;
  
  container.innerHTML = achievements.map(a => `
    <div class="achievement ${factCount >= a.threshold ? 'unlocked' : 'locked'}">
      <div class="achievement-icon">${a.emoji}</div>
      <div class="achievement-name">${a.name}</div>
    </div>
  `).join('');
}

function renderTasks() {
  const tasks = [
    { id: "chat3", text: "对话3次", reward: "+30 XP", completed: false },
    { id: "memory5", text: "记忆+5", reward: "+50 XP", completed: false },
    { id: "voice", text: "语音互动", reward: "+20 XP", completed: false },
  ];
  
  const container = $("#tasks-list");
  container.innerHTML = tasks.map(t => `
    <div class="task-item ${t.completed ? 'completed' : ''}">
      <div class="task-checkbox"></div>
      <span class="task-text">${t.text}</span>
      <span class="task-reward">${t.reward}</span>
    </div>
  `).join('');
}

// ========== 记忆更新检测 ==========
let lastFactCount = 0;
async function checkMemoryUpdate() {
  try {
    const bond = await (await fetch("/api/bond")).json();
    const count = bond.factCount || 0;
    if (lastFactCount > 0 && count > lastFactCount) {
      showToast("🧠 记忆碎片 +1 · 我又了解你多一点了", "achievement");
    }
    lastFactCount = count;
  } catch {}
}

async function loadBond() {
  try {
    const bond = await (await fetch("/api/bond")).json();
    $("#agent-name").textContent = bond.myName || "小O";
    lastFactCount = bond.factCount || 0;
  } catch {}
}

// ========== 引导流程 ==========
function checkOnboarding() {
  const done = localStorage.getItem("omeclaw_onboarding");
  if (!done) {
    showOnboarding();
  }
}

function showOnboarding() {
  const modal = $("#onboarding-modal");
  modal.style.display = "flex";
  
  const steps = [
    {
      title: "给我起个名字？",
      desc: "你想叫我什么？",
      input: true,
      placeholder: "比如：小O、Jane、阿尔法...",
      key: "name"
    },
    {
      title: "我该怎么叫你？",
      desc: "你希望我怎么称呼你？",
      input: true,
      placeholder: "比如：老板、主人、朋友...",
      key: "callUser"
    },
    {
      title: "准备好了！",
      desc: "现在开始聊天，让我慢慢了解你吧~",
      final: true
    }
  ];
  
  let currentStep = 0;
  const answers = {};
  
  function renderStep() {
    const step = steps[currentStep];
    $("#onboarding-title").textContent = step.title;
    $("#onboarding-desc").textContent = step.desc;
    $("#onboarding-progress").style.width = `${((currentStep + 1) / steps.length) * 100}%`;
    
    const content = $("#onboarding-content");
    if (step.input) {
      content.innerHTML = `<input type="text" id="onboarding-input" placeholder="${step.placeholder}" style="width:100%;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:12px;color:var(--text);font-size:15px;outline:none;margin-top:12px">`;
      setTimeout(() => $("#onboarding-input")?.focus(), 100);
    } else {
      content.innerHTML = "";
    }
    
    $("#onboarding-next").textContent = step.final ? "开始" : "下一步";
  }
  
  $("#onboarding-next").onclick = async () => {
    const step = steps[currentStep];
    if (step.input) {
      const input = $("#onboarding-input");
      const value = input?.value.trim();
      if (!value) {
        showToast("请输入内容", "error");
        return;
      }
      answers[step.key] = value;
    }
    
    if (step.final) {
      // 提交答案
      if (answers.name) {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `以后叫你${answers.name}`, sessionId: OWNER_SESSION })
        });
      }
      if (answers.callUser) {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `叫我${answers.callUser}`, sessionId: OWNER_SESSION })
        });
      }
      
      localStorage.setItem("omeclaw_onboarding", "1");
      modal.style.display = "none";
      loadChatHistory();
      loadBond();
      return;
    }
    
    currentStep++;
    renderStep();
  };
  
  $("#onboarding-skip").onclick = () => {
    localStorage.setItem("omeclaw_onboarding", "1");
    modal.style.display = "none";
  };
  
  renderStep();
}

// ========== 初始化 ==========
async function init() {
  try {
    const resp = await fetch("/api/agents");
    const data = await resp.json();
    agents = data.agents || [];
    currentAgent = agents[0]?.id || "";
  } catch (e) {
    console.error("init:", e);
  }
  
  const savedView = localStorage.getItem("omeclaw_view") || "chat";
  switchView(savedView);
  loadBond();
  
  setTimeout(checkOnboarding, 500);
}

init();
