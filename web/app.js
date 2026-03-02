// ========== OmeClaw v0.7.0 - 完全重构版 ==========
// 全局变量
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
let lastFactCount = 0;

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
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ========== 导航 ==========
function switchView(view) {
  currentView = view;
  $$(".view").forEach(v => v.classList.remove("active"));
  $$(".nav-tab").forEach(t => t.classList.remove("active"));
  const viewEl = $(`#view-${view}`);
  const tabEl = $(`.nav-tab[data-view="${view}"]`);
  if (viewEl) viewEl.classList.add("active");
  if (tabEl) tabEl.classList.add("active");
  localStorage.setItem("omeclaw_view", view);
  
  if (view === "chat") loadChatHistory();
  if (view === "memory") loadMemory();
  if (view === "grow") loadGrow();
}

$$(".nav-tab").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

window.goBack = function() {
  $$(".subview.active").forEach(v => v.classList.remove("active"));
};

// ========== 聊天 ==========
async function loadChatHistory() {
  try {
    const resp = await fetch(`/api/chat/history?merged=1`);
    const { messages } = await resp.json();
    const container = $("#messages");
    if (!container) return;
    
    if (!messages || !messages.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:var(--text2)">
          <div style="font-size:48px;margin-bottom:16px">🪼</div>
          <h3 style="font-size:20px;margin-bottom:8px;color:var(--text)">嘿 👋</h3>
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
  if (!container) return null;
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = html;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

const chatForm = $("#chat-form");
if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#chat-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    
    input.value = "";
    addMsg("user", esc(text));
    
    const thinkingMsg = addMsg("assistant", '<div class="thinking-dots"><span></span><span></span><span></span></div>');
    if (thinkingMsg) thinkingMsg.classList.add("thinking");
    
    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: OWNER_SESSION, agentId: currentAgent })
      });
      const data = await resp.json();
      
      if (thinkingMsg) thinkingMsg.remove();
      
      if (data.error) {
        addMsg("assistant", `<span style="color:var(--red)">错误: ${esc(data.error)}</span>`);
      } else {
        addMsg("assistant", formatMsg(data.reply || "无回复"));
        if (ttsEnabled && data.reply) speak(data.reply);
      }
    } catch (err) {
      if (thinkingMsg) thinkingMsg.remove();
      addMsg("assistant", `<span style="color:var(--red)">网络错误: ${esc(err.message)}</span>`);
    }
    
    setTimeout(checkMemoryUpdate, 800);
    setTimeout(loadBond, 1000);
  });
}

// ========== 语音 ==========
function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  const btn = $("#tts-toggle");
  if (btn) btn.textContent = ttsEnabled ? "🔊" : "🔇";
  showToast(ttsEnabled ? "语音播报已开启" : "语音播报已关闭", "info");
}

function speak(text) {
  if (!window.speechSynthesis) {
    console.warn("浏览器不支持TTS");
    return;
  }
  
  // 停止当前播放
  speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  
  // 尝试使用更好的中文语音
  const voices = speechSynthesis.getVoices();
  const chineseVoice = voices.find(v => 
    v.lang.includes('zh') || v.lang.includes('CN')
  );
  if (chineseVoice) {
    utterance.voice = chineseVoice;
  }
  
  utterance.onerror = (e) => {
    console.error("TTS error:", e);
  };
  
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
  // 检查浏览器支持
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast("浏览器不支持语音识别\n请使用Chrome或Safari", "info");
    return;
  }
  
  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  
  recognition.onstart = () => {
    isRecording = true;
    const btn = $("#voice-btn");
    if (btn) btn.classList.add("recording");
    console.log("语音识别已启动");
  };
  
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log("识别结果:", transcript);
    const input = $("#chat-input");
    if (input) {
      input.value = transcript;
      const form = $("#chat-form");
      if (form) {
        setTimeout(() => form.requestSubmit(), 100);
      }
    }
  };
  
  recognition.onerror = (event) => {
    console.error("语音识别错误:", event.error);
    stopRecording();
    
    let msg = "语音识别失败";
    if (event.error === "not-allowed" || event.error === "permission-denied") {
      msg = "请允许麦克风权限";
    } else if (event.error === "no-speech") {
      msg = "没有检测到语音";
    } else if (event.error === "network") {
      msg = "网络错误";
    }
    showToast(msg, "info");
  };
  
  recognition.onend = () => {
    stopRecording();
    console.log("语音识别已结束");
  };
  
  try {
    recognition.start();
    console.log("开始录音...");
  } catch (e) {
    console.error("启动语音识别失败:", e);
    showToast("语音识别启动失败", "info");
    stopRecording();
  }
}

function stopRecording() {
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      console.error("停止识别失败:", e);
    }
    recognition = null;
  }
  isRecording = false;
  const btn = $("#voice-btn");
  if (btn) btn.classList.remove("recording");
}

// ========== 记忆 ==========
async function loadMemory() {
  try {
    const data = await (await fetch("/api/memory/model")).json();
    renderMemoryPlanet(data);
    renderMemoryCategories(data);
    setupMemoryParallax();
  } catch (e) {
    console.error("loadMemory:", e);
  }
}

// 记忆页视差滚动效果
function setupMemoryParallax() {
  const memoryView = $("#view-memory");
  if (!memoryView) return;
  
  const hero = memoryView.querySelector(".memory-hero");
  const planet = $("#memory-planet");
  const categories = memoryView.querySelector(".memory-categories");
  
  if (!hero || !planet || !categories) return;
  
  // 移除旧的监听器
  categories.onscroll = null;
  
  categories.addEventListener("scroll", () => {
    const scrollY = categories.scrollTop;
    const maxScroll = 200;
    const progress = Math.min(scrollY / maxScroll, 1);
    
    // 星球缩小和淡出
    const scale = 1 - progress * 0.3;
    const opacity = 1 - progress * 0.4;
    const translateY = -scrollY * 0.3;
    
    planet.style.transform = `scale(${scale}) translateY(${translateY}px)`;
    planet.style.opacity = opacity;
    
    // Hero区域整体效果
    if (scrollY > 50) {
      hero.classList.add("scrolled");
    } else {
      hero.classList.remove("scrolled");
    }
  });
}

function renderMemoryPlanet(data) {
  const canvas = $("#memory-planet");
  if (!canvas) return;
  
  canvas.width = 200;
  canvas.height = 200;
  
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = 70;
  
  ctx.clearRect(0, 0, w, h);
  
  // 背景星空
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.4})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
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
    const x = cx + Math.cos(angle) * (r + 20);
    const y = cy + Math.sin(angle) * (r + 20);
    
    ctx.fillStyle = cat.filled ? "#00d47b" : "#2a2a3a";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
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
  
  const pctEl = $("#memory-pct");
  const countEl = $("#memory-count");
  const layersEl = $("#memory-layers");
  if (pctEl) pctEl.textContent = `${data.totalFacts ? Math.round(data.filledCategories / data.totalCategories * 100) : 0}%`;
  if (countEl) countEl.textContent = data.totalFacts || 0;
  if (layersEl) layersEl.textContent = `${data.filledCategories || 0}/11`;
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
    const avatarEl = $("#grow-avatar");
    const nameEl = $("#grow-name");
    const levelEl = $("#grow-level");
    const fillEl = $("#bond-fill");
    const xpEl = $("#bond-xp");
    const nextEl = $("#bond-next");
    const streakEl = $("#streak-num");
    
    if (avatarEl) avatarEl.textContent = bond.emoji || "🪼";
    if (nameEl) nameEl.textContent = bond.myName || "Ome";
    if (levelEl) levelEl.textContent = bond.level || "初见";
    
    const progress = bond.progressToNext || 0;
    if (fillEl) fillEl.style.width = `${progress}%`;
    if (xpEl) xpEl.textContent = `${bond.xp || 0} XP`;
    if (nextEl) nextEl.textContent = bond.nextMilestone ? `→ ${bond.nextMilestone.emoji} ${bond.nextMilestone.name} (${bond.nextMilestone.xp} XP)` : "已满级";
    
    // Streak火焰效果
    const streak = parseInt(localStorage.getItem("omeclaw_streak") || "0");
    if (streakEl) {
      streakEl.textContent = streak;
      const parent = streakEl.parentElement;
      if (parent && streak > 0) {
        parent.classList.add("streak-flame");
      }
    }
    
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
  if (!container) return;
  const factCount = bond.factCount || 0;
  
  // 检查是否有新解锁的成就
  const lastFactCountStored = parseInt(localStorage.getItem("omeclaw_last_fact_count") || "0");
  for (const a of achievements) {
    if (factCount >= a.threshold && lastFactCountStored < a.threshold) {
      setTimeout(() => {
        showToast(`🎉 成就解锁：${a.emoji} ${a.name}`, "achievement");
        showXPFloat("+100 XP");
      }, 500);
    }
  }
  localStorage.setItem("omeclaw_last_fact_count", factCount.toString());
  
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
  if (!container) return;
  container.innerHTML = tasks.map(t => `
    <div class="task-item ${t.completed ? 'completed' : ''}">
      <div class="task-checkbox"></div>
      <span class="task-text">${t.text}</span>
      <span class="task-reward">${t.reward}</span>
    </div>
  `).join('');
}

// ========== 记忆更新检测 ==========
async function checkMemoryUpdate() {
  try {
    const bond = await (await fetch("/api/bond")).json();
    const count = bond.factCount || 0;
    if (lastFactCount > 0 && count > lastFactCount) {
      showToast("🧠 记忆碎片 +1 · 我又了解你多一点了", "achievement");
      showXPFloat("+50 XP");
    }
    lastFactCount = count;
  } catch {}
}

// ========== 游戏化动画效果 ==========
function showXPFloat(text) {
  const el = document.createElement("div");
  el.className = "xp-float";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
  
  // 触发经验条脉冲
  const progress = $(".bond-progress");
  if (progress) {
    progress.classList.add("gaining-xp");
    setTimeout(() => progress.classList.remove("gaining-xp"), 600);
  }
}

function showLevelUpEffect(levelName, emoji) {
  const overlay = document.createElement("div");
  overlay.className = "level-up-effect";
  overlay.innerHTML = `
    <div class="level-up-content">
      <div style="font-size:80px;margin-bottom:20px">${emoji}</div>
      <div>等级提升！</div>
      <div style="font-size:32px;margin-top:10px">${levelName}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  // 烟花效果
  createFireworks();
  
  setTimeout(() => overlay.remove(), 2000);
}

function createFireworks() {
  const colors = ['#ff5050', '#ffa040', '#ffd740', '#00d47b', '#4d9fff', '#b366ff'];
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  
  for (let i = 0; i < 30; i++) {
    setTimeout(() => {
      const firework = document.createElement("div");
      firework.className = "level-up-firework";
      firework.style.left = centerX + "px";
      firework.style.top = centerY + "px";
      firework.style.background = colors[Math.floor(Math.random() * colors.length)];
      
      const angle = (Math.PI * 2 * i) / 30;
      const distance = 100 + Math.random() * 100;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;
      
      firework.style.setProperty('--tx', tx + 'px');
      firework.style.setProperty('--ty', ty + 'px');
      firework.style.animation = 'fireworkExplode 1s ease-out forwards';
      
      document.body.appendChild(firework);
      setTimeout(() => firework.remove(), 1000);
    }, i * 20);
  }
}

function showComboEffect(count) {
  const el = document.createElement("div");
  el.className = "combo-indicator";
  el.textContent = `${count}x COMBO!`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// Streak火焰动画
function updateStreakDisplay() {
  const streakEl = $("#streak-num");
  if (!streakEl) return;
  
  const streak = parseInt(localStorage.getItem("omeclaw_streak") || "0");
  streakEl.textContent = streak;
  
  // 添加火焰效果
  const parent = streakEl.parentElement;
  if (parent && streak > 0) {
    parent.classList.add("streak-flame");
  }
}

async function loadBond() {
  try {
    const bond = await (await fetch("/api/bond")).json();
    const nameEl = $("#agent-name");
    if (nameEl) nameEl.textContent = bond.myName || "Ome";
    lastFactCount = bond.factCount || 0;
  } catch {}
}

// ========== 引导流程 ==========
function checkOnboarding() {
  const done = localStorage.getItem("omeclaw_onboarding");
  if (!done) {
    setTimeout(showOnboarding, 800);
  }
}

function showOnboarding() {
  const modal = $("#onboarding-modal");
  if (!modal) return;
  modal.style.display = "flex";
  
  const steps = [
    { title: "给我起个名字？", desc: "你想叫我什么？", input: true, placeholder: "比如：Ome、Jane、阿尔法...", key: "name", defaultValue: "Ome" },
    { title: "我该怎么叫你？", desc: "你希望我怎么称呼你？", input: true, placeholder: "比如：主人、老板、朋友...", key: "callUser", defaultValue: "主人" },
    { title: "准备好了！", desc: "现在开始聊天，让我慢慢了解你吧~", final: true }
  ];
  
  let currentStep = 0;
  const answers = { name: "Ome", callUser: "主人" }; // 默认值
  
  function renderStep() {
    const step = steps[currentStep];
    const titleEl = $("#onboarding-title");
    const descEl = $("#onboarding-desc");
    const progressEl = $("#onboarding-progress");
    const contentEl = $("#onboarding-content");
    const nextBtn = $("#onboarding-next");
    
    if (!titleEl || !descEl || !progressEl || !contentEl || !nextBtn) return;
    
    titleEl.textContent = step.title;
    descEl.textContent = step.desc;
    progressEl.style.width = `${((currentStep + 1) / steps.length) * 100}%`;
    
    if (step.input) {
      contentEl.innerHTML = `<input type="text" id="onboarding-input" value="${step.defaultValue || ''}" placeholder="${step.placeholder}" style="width:100%;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:12px;color:var(--text);font-size:15px;outline:none;margin-top:12px">`;
      setTimeout(() => {
        const input = $("#onboarding-input");
        if (input) {
          input.focus();
          input.select();
          input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              nextBtn.click();
            }
          });
        }
      }, 100);
    } else {
      contentEl.innerHTML = "";
    }
    
    nextBtn.textContent = step.final ? "开始" : "下一步";
  }
  
  const nextBtn = $("#onboarding-next");
  const skipBtn = $("#onboarding-skip");
  
  if (nextBtn) {
    // 移除旧的事件监听器
    const newNextBtn = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
    
    newNextBtn.addEventListener("click", async () => {
      const step = steps[currentStep];
      if (step.input) {
        const input = $("#onboarding-input");
        const value = input?.value.trim();
        if (value) {
          answers[step.key] = value;
        }
        // 如果用户没输入，使用默认值
      }
      
      if (step.final) {
        try {
          // 使用最终的answers（包含默认值）
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
        } catch (e) {
          console.error("Onboarding submit error:", e);
        }
        
        localStorage.setItem("omeclaw_onboarding", "1");
        modal.style.display = "none";
        setTimeout(() => {
          loadChatHistory();
          loadBond();
        }, 300);
        return;
      }
      
      currentStep++;
      renderStep();
    });
  }
  
  if (skipBtn) {
    const newSkipBtn = skipBtn.cloneNode(true);
    skipBtn.parentNode.replaceChild(newSkipBtn, skipBtn);
    
    newSkipBtn.addEventListener("click", async () => {
      // 跳过时也使用默认值
      try {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `以后叫你Ome`, sessionId: OWNER_SESSION })
        });
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `叫我主人`, sessionId: OWNER_SESSION })
        });
      } catch (e) {
        console.error("Skip onboarding error:", e);
      }
      
      localStorage.setItem("omeclaw_onboarding", "1");
      modal.style.display = "none";
      setTimeout(() => {
        loadChatHistory();
        loadBond();
      }, 300);
    });
  }
  
  renderStep();
}

// ========== 子页面 ==========
async function loadAgentsList() {
  try {
    const resp = await fetch("/api/agents");
    const data = await resp.json();
    const container = $("#agents-list");
    if (!container) return;
    
    const agentsList = data.agents || [];
    container.innerHTML = agentsList.map(a => `
      <div class="agent-card">
        <div class="agent-card-header">
          <span class="agent-role-badge ${a.role}">${a.role}</span>
          <h3>${esc(a.name)}</h3>
        </div>
        <p>${esc(a.systemPrompt.slice(0, 100))}...</p>
        <div class="agent-card-footer">
          <span class="agent-model">${esc(a.model)}</span>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error("loadAgentsList:", e);
  }
}

async function loadActivityLog() {
  try {
    const resp = await fetch("/api/activity");
    const data = await resp.json();
    const container = $("#activity-timeline");
    if (!container) return;
    
    const items = data.timeline || [];
    container.innerHTML = items.slice(-50).reverse().map(item => {
      const time = new Date(item.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      let icon = "📝";
      let className = "activity-item";
      
      if (item.type === "user_in") { icon = "💬"; className += " user"; }
      else if (item.type === "agent_out") { icon = "🤖"; className += " agent"; }
      else if (item.type === "memory") { icon = "🧠"; className += " memory"; }
      else if (item.type === "tool") { icon = "🔧"; className += " tool"; }
      else if (item.type === "system") { icon = "⚙️"; className += " system"; }
      
      return `
        <div class="${className}">
          <span class="activity-icon">${icon}</span>
          <span class="activity-time">${time}</span>
          <span class="activity-detail">${esc(item.detail.slice(0, 100))}</span>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error("loadActivityLog:", e);
  }
}

// ========== 初始化 ==========
async function init() {
  console.log("OmeClaw v0.7.0 初始化...");
  
  try {
    const resp = await fetch("/api/agents");
    const data = await resp.json();
    agents = data.agents || [];
    currentAgent = agents[0]?.id || "";
  } catch (e) {
    console.error("init agents:", e);
  }
  
  // 绑定语音按钮
  const voiceBtn = $("#voice-btn");
  if (voiceBtn) {
    voiceBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleVoice();
    });
  }
  
  // 绑定TTS按钮
  const ttsBtn = $("#tts-toggle");
  if (ttsBtn) {
    ttsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleTTS();
    });
  }
  
  // 绑定我的页面按钮
  const mbtiBtn = $("#mbti-test-btn");
  if (mbtiBtn) {
    mbtiBtn.addEventListener("click", () => {
      showToast("MBTI测试开发中...", "info");
    });
  }
  
  const agentsManageBtn = $("#agents-manage-btn");
  if (agentsManageBtn) {
    agentsManageBtn.addEventListener("click", () => {
      const view = $("#view-agents");
      if (view) {
        view.classList.add("active");
        loadAgentsList();
      }
    });
  }
  
  const activityLogBtn = $("#activity-log-btn");
  if (activityLogBtn) {
    activityLogBtn.addEventListener("click", () => {
      const view = $("#view-activity");
      if (view) {
        view.classList.add("active");
        loadActivityLog();
      }
    });
  }
  
  const themeBtn = $("#theme-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      showToast("主题切换开发中...", "info");
    });
  }
  
  const aboutBtn = $("#about-btn");
  if (aboutBtn) {
    aboutBtn.addEventListener("click", () => {
      showToast("OmeClaw v0.7.0\n你的24小时AI分身", "info");
    });
  }
  
  const importBtn = $("#import-btn");
  if (importBtn) {
    importBtn.addEventListener("click", () => {
      showToast("数据导入开发中...", "info");
    });
  }
  
  const shareBtn = $("#share-btn");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      showToast("分享功能开发中...", "info");
    });
  }
  
  // 恢复上次的视图
  const savedView = localStorage.getItem("omeclaw_view") || "chat";
  switchView(savedView);
  loadBond();
  
  // 延迟检查引导
  checkOnboarding();
  
  console.log("OmeClaw 初始化完成！");
}

// 启动
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ========== 终身记忆系统 ==========

// 记忆搜索
async function searchMemory(query) {
  try {
    const res = await fetch(`/api/memory/search?q=${encodeURIComponent(query)}&sessionId=${OWNER_SESSION}&limit=100`);
    const data = await res.json();
    return data.results;
  } catch (e) {
    console.error("搜索记忆失败:", e);
    return [];
  }
}

// 显示记忆搜索界面
function showMemorySearch() {
  const modal = document.createElement("div");
  modal.className = "modal active";
  modal.innerHTML = `
    <div class="modal-content" style="max-width:800px">
      <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
      <h2 style="margin-bottom:20px">🔍 记忆搜索</h2>
      
      <div style="margin-bottom:20px">
        <input type="text" id="memory-search-input" placeholder="搜索记忆..." 
               style="width:100%;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:12px;color:var(--text);font-size:15px">
      </div>
      
      <div id="memory-search-results" style="max-height:400px;overflow-y:auto"></div>
      
      <div style="margin-top:20px;display:flex;gap:12px">
        <button onclick="exportMemory('json')" style="flex:1;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;color:var(--text);cursor:pointer">
          导出JSON
        </button>
        <button onclick="exportMemory('markdown')" style="flex:1;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;color:var(--text);cursor:pointer">
          导出Markdown
        </button>
        <button onclick="showMemoryTimeline()" style="flex:1;padding:12px;background:var(--accent);border:none;border-radius:12px;color:white;cursor:pointer">
          时光机
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  const input = document.getElementById("memory-search-input");
  input.focus();
  
  let searchTimeout;
  input.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const results = await searchMemory(input.value);
      renderMemorySearchResults(results);
    }, 300);
  });
  
  // 初始加载
  searchMemory("").then(renderMemorySearchResults);
}

function renderMemorySearchResults(results) {
  const container = document.getElementById("memory-search-results");
  if (!container) return;
  
  if (results.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text2)">
        <div style="font-size:48px;margin-bottom:12px">🔍</div>
        <div>没有找到记忆</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = results.map(m => `
    <div style="padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <span style="padding:4px 8px;background:var(--accent-bg);color:var(--accent);border-radius:6px;font-size:12px">
          ${m.type}
        </span>
        <span style="font-size:12px;color:var(--text2)">
          ${new Date(m.timestamp).toLocaleString()}
        </span>
        <span style="margin-left:auto;font-size:12px;color:var(--text2)">
          重要性: ${"⭐".repeat(Math.min(m.importance, 5))}
        </span>
      </div>
      <div style="margin-bottom:8px">${m.content}</div>
      ${m.tags.length > 0 ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${m.tags.map(tag => `
            <span style="padding:2px 8px;background:var(--surface2);border-radius:12px;font-size:11px;color:var(--text2)">
              #${tag}
            </span>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `).join("");
}

// 记忆时光机
async function showMemoryTimeline() {
  try {
    const res = await fetch(`/api/memory/timeline?sessionId=${OWNER_SESSION}&groupBy=day`);
    const data = await res.json();
    
    const modal = document.createElement("div");
    modal.className = "modal active";
    modal.innerHTML = `
      <div class="modal-content" style="max-width:900px">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <h2 style="margin-bottom:20px">⏰ 记忆时光机</h2>
        
        <div id="memory-timeline" style="max-height:500px;overflow-y:auto"></div>
      </div>
    `;
    document.body.appendChild(modal);
    
    const timeline = document.getElementById("memory-timeline");
    const entries = Object.entries(data.timeline).sort((a, b) => b[0].localeCompare(a[0]));
    
    timeline.innerHTML = entries.map(([date, memories]) => `
      <div style="margin-bottom:32px">
        <h3 style="position:sticky;top:0;background:var(--surface);padding:12px;border-radius:12px;margin-bottom:12px">
          📅 ${date}
        </h3>
        <div style="padding-left:20px;border-left:2px solid var(--border)">
          ${memories.map(m => `
            <div style="position:relative;padding:12px;background:var(--surface2);border-radius:12px;margin-bottom:12px;margin-left:20px">
              <div style="position:absolute;left:-26px;top:16px;width:12px;height:12px;background:var(--accent);border-radius:50%;border:2px solid var(--surface)"></div>
              <div style="font-size:12px;color:var(--text2);margin-bottom:4px">
                ${new Date(m.timestamp).toLocaleTimeString()}
              </div>
              <div>${m.content}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");
  } catch (e) {
    console.error("加载时光机失败:", e);
  }
}

// 导出记忆
async function exportMemory(format) {
  try {
    const res = await fetch(`/api/memory/export?sessionId=${OWNER_SESSION}&format=${format}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memory-export.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`记忆已导出为${format.toUpperCase()}`, "success");
  } catch (e) {
    console.error("导出失败:", e);
    showToast("导出失败", "error");
  }
}

// 在"我的"页面添加记忆搜索按钮
function addMemorySearchButton() {
  const profileView = document.getElementById("view-profile");
  if (!profileView) return;
  
  const existingBtn = document.getElementById("memory-search-btn");
  if (existingBtn) return;
  
  const btn = document.createElement("button");
  btn.id = "memory-search-btn";
  btn.className = "profile-action-btn";
  btn.innerHTML = "🔍 记忆搜索";
  btn.style.cssText = "width:100%;padding:16px;background:linear-gradient(135deg,var(--accent),var(--blue));border:none;border-radius:12px;color:white;font-size:16px;font-weight:600;cursor:pointer;margin-bottom:12px";
  btn.onclick = showMemorySearch;
  
  const agentManageBtn = document.querySelector('[onclick="showView(\'agents\')"]');
  if (agentManageBtn && agentManageBtn.parentElement) {
    agentManageBtn.parentElement.insertBefore(btn, agentManageBtn);
  }
}

// 初始化
setTimeout(addMemorySearchButton, 1000);

console.log("✅ 终身记忆系统前端已加载");
