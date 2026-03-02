// 60秒魔法引导系统
class OnboardingFlow {
  constructor() {
    this.currentStep = 0;
    this.userData = {
      name: '',
      callMe: '',
      personality: [],
      interests: [],
      goals: [],
      relationship: 'friend'
    };
    this.startTime = Date.now();
  }

  async start() {
    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
      <div class="onboarding-container">
        <div class="onboarding-progress">
          <div class="progress-bar" id="onboarding-progress"></div>
          <div class="progress-time" id="onboarding-time">60s</div>
        </div>
        <div class="onboarding-content" id="onboarding-content"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    this.overlay = overlay;
    this.progressBar = overlay.querySelector('#onboarding-progress');
    this.timeDisplay = overlay.querySelector('#onboarding-time');
    this.content = overlay.querySelector('#onboarding-content');

    this.startTimer();
    this.showStep(0);
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const remaining = Math.max(0, 60 - elapsed);
      this.timeDisplay.textContent = `${remaining}s`;
      
      if (remaining === 0) {
        clearInterval(this.timerInterval);
        this.complete();
      }
    }, 1000);
  }

  showStep(step) {
    this.currentStep = step;
    const progress = ((step + 1) / 6) * 100;
    this.progressBar.style.width = `${progress}%`;

    const steps = [
      this.stepWelcome.bind(this),
      this.stepName.bind(this),
      this.stepPersonality.bind(this),
      this.stepInterests.bind(this),
      this.stepGoals.bind(this),
      this.stepRelationship.bind(this)
    ];

    if (step < steps.length) {
      steps[step]();
    } else {
      this.complete();
    }
  }

  stepWelcome() {
    this.content.innerHTML = `
      <div class="step-welcome animate-in">
        <div class="welcome-emoji">🪼</div>
        <h2>欢迎来到 OmeClaw</h2>
        <p>我是你的 AI 分身系统</p>
        <p class="welcome-subtitle">用 60 秒，让我了解真实的你</p>
        <button class="btn-primary" onclick="onboarding.next()">开始魔法 ✨</button>
      </div>
    `;
  }

  stepName() {
    this.content.innerHTML = `
      <div class="step-form animate-in">
        <div class="step-icon">👋</div>
        <h3>我该怎么称呼你？</h3>
        <input type="text" id="input-name" placeholder="你的名字" class="input-large" autofocus>
        <div class="quick-options">
          <button class="btn-quick" onclick="onboarding.setName('朋友')">朋友</button>
          <button class="btn-quick" onclick="onboarding.setName('主人')">主人</button>
          <button class="btn-quick" onclick="onboarding.setName('伙伴')">伙伴</button>
        </div>
        <button class="btn-primary" onclick="onboarding.next()">下一步</button>
      </div>
    `;
    
    document.getElementById('input-name').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.next();
    });
  }

  stepPersonality() {
    this.content.innerHTML = `
      <div class="step-form animate-in">
        <div class="step-icon">🎭</div>
        <h3>你是什么样的人？</h3>
        <p class="step-hint">选择最符合你的标签（多选）</p>
        <div class="tag-grid">
          <button class="tag-btn" data-value="内向">🤫 内向</button>
          <button class="tag-btn" data-value="外向">🎉 外向</button>
          <button class="tag-btn" data-value="理性">🧠 理性</button>
          <button class="tag-btn" data-value="感性">❤️ 感性</button>
          <button class="tag-btn" data-value="乐观">☀️ 乐观</button>
          <button class="tag-btn" data-value="谨慎">🛡️ 谨慎</button>
          <button class="tag-btn" data-value="冒险">🚀 冒险</button>
          <button class="tag-btn" data-value="稳重">⚖️ 稳重</button>
        </div>
        <button class="btn-primary" onclick="onboarding.next()">下一步</button>
      </div>
    `;

    this.content.querySelectorAll('.tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        const value = btn.dataset.value;
        const idx = this.userData.personality.indexOf(value);
        if (idx > -1) {
          this.userData.personality.splice(idx, 1);
        } else {
          this.userData.personality.push(value);
        }
      });
    });
  }

  stepInterests() {
    this.content.innerHTML = `
      <div class="step-form animate-in">
        <div class="step-icon">❤️</div>
        <h3>你喜欢什么？</h3>
        <p class="step-hint">选择你的兴趣爱好（多选）</p>
        <div class="tag-grid">
          <button class="tag-btn" data-value="阅读">📚 阅读</button>
          <button class="tag-btn" data-value="音乐">🎵 音乐</button>
          <button class="tag-btn" data-value="电影">🎬 电影</button>
          <button class="tag-btn" data-value="游戏">🎮 游戏</button>
          <button class="tag-btn" data-value="运动">⚽ 运动</button>
          <button class="tag-btn" data-value="旅行">✈️ 旅行</button>
          <button class="tag-btn" data-value="美食">🍜 美食</button>
          <button class="tag-btn" data-value="编程">💻 编程</button>
          <button class="tag-btn" data-value="艺术">🎨 艺术</button>
          <button class="tag-btn" data-value="摄影">📷 摄影</button>
        </div>
        <button class="btn-primary" onclick="onboarding.next()">下一步</button>
      </div>
    `;

    this.content.querySelectorAll('.tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        const value = btn.dataset.value;
        const idx = this.userData.interests.indexOf(value);
        if (idx > -1) {
          this.userData.interests.splice(idx, 1);
        } else {
          this.userData.interests.push(value);
        }
      });
    });
  }

  stepGoals() {
    this.content.innerHTML = `
      <div class="step-form animate-in">
        <div class="step-icon">🎯</div>
        <h3>你希望我帮你什么？</h3>
        <p class="step-hint">选择你的目标（多选）</p>
        <div class="tag-grid">
          <button class="tag-btn" data-value="陪伴聊天">💬 陪伴聊天</button>
          <button class="tag-btn" data-value="工作助手">💼 工作助手</button>
          <button class="tag-btn" data-value="学习伙伴">📖 学习伙伴</button>
          <button class="tag-btn" data-value="情感支持">🫂 情感支持</button>
          <button class="tag-btn" data-value="创意灵感">💡 创意灵感</button>
          <button class="tag-btn" data-value="生活规划">📅 生活规划</button>
        </div>
        <button class="btn-primary" onclick="onboarding.next()">下一步</button>
      </div>
    `;

    this.content.querySelectorAll('.tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        const value = btn.dataset.value;
        const idx = this.userData.goals.indexOf(value);
        if (idx > -1) {
          this.userData.goals.splice(idx, 1);
        } else {
          this.userData.goals.push(value);
        }
      });
    });
  }

  stepRelationship() {
    this.content.innerHTML = `
      <div class="step-form animate-in">
        <div class="step-icon">🤝</div>
        <h3>我们是什么关系？</h3>
        <p class="step-hint">选择你希望的相处模式</p>
        <div class="relationship-grid">
          <button class="relationship-card" data-value="friend">
            <div class="rel-emoji">👥</div>
            <div class="rel-title">朋友</div>
            <div class="rel-desc">平等、轻松、互相支持</div>
          </button>
          <button class="relationship-card" data-value="assistant">
            <div class="rel-emoji">🤖</div>
            <div class="rel-title">助手</div>
            <div class="rel-desc">专业、高效、随叫随到</div>
          </button>
          <button class="relationship-card" data-value="companion">
            <div class="rel-emoji">💙</div>
            <div class="rel-title">伙伴</div>
            <div class="rel-desc">深度、陪伴、共同成长</div>
          </button>
          <button class="relationship-card" data-value="mentor">
            <div class="rel-emoji">🧙</div>
            <div class="rel-title">导师</div>
            <div class="rel-desc">引导、启发、智慧分享</div>
          </button>
        </div>
        <button class="btn-primary" onclick="onboarding.complete()">完成 🎉</button>
      </div>
    `;

    this.content.querySelectorAll('.relationship-card').forEach(btn => {
      btn.addEventListener('click', () => {
        this.content.querySelectorAll('.relationship-card').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.userData.relationship = btn.dataset.value;
      });
    });
  }

  setName(name) {
    document.getElementById('input-name').value = name;
  }

  next() {
    // 保存当前步骤的数据
    if (this.currentStep === 1) {
      const nameInput = document.getElementById('input-name');
      this.userData.callMe = nameInput.value.trim() || '朋友';
    }

    this.showStep(this.currentStep + 1);
  }

  async complete() {
    clearInterval(this.timerInterval);

    // 显示完成动画
    this.content.innerHTML = `
      <div class="step-complete animate-in">
        <div class="complete-animation">
          <div class="complete-emoji">✨</div>
          <div class="complete-rings"></div>
        </div>
        <h2>魔法完成！</h2>
        <p>正在为你生成专属分身...</p>
      </div>
    `;

    // 提交数据到后端
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.userData)
      });

      const result = await response.json();

      if (result.ok) {
        // 显示成功消息
        setTimeout(() => {
          this.content.innerHTML = `
            <div class="step-complete animate-in">
              <div class="complete-emoji">🎉</div>
              <h2>欢迎，${this.userData.callMe}！</h2>
              <p>你的专属 AI 分身已就绪</p>
              <p class="complete-stats">
                🧠 已记录 ${result.factsCreated} 条记忆<br>
                💎 羁绊等级：${result.bondLevel}<br>
                ⚡ 获得 ${result.xpGained} XP
              </p>
              <button class="btn-primary" onclick="onboarding.finish()">开始使用</button>
            </div>
          `;
        }, 1500);
      } else {
        throw new Error(result.error || '提交失败');
      }
    } catch (error) {
      console.error('Onboarding error:', error);
      this.content.innerHTML = `
        <div class="step-complete animate-in">
          <div class="complete-emoji">😅</div>
          <h2>出了点小问题</h2>
          <p>${error.message}</p>
          <button class="btn-primary" onclick="onboarding.complete()">重试</button>
          <button class="btn-secondary" onclick="onboarding.finish()">跳过</button>
        </div>
      `;
    }
  }

  finish() {
    this.overlay.classList.add('fade-out');
    setTimeout(() => {
      this.overlay.remove();
      // 刷新页面数据
      if (window.loadBondStatus) window.loadBondStatus();
      if (window.loadMemoryModel) window.loadMemoryModel();
      if (window.loadEvolution) window.loadEvolution();
    }, 500);
  }
}

// 全局实例
let onboarding = null;

// 自动检测是否需要引导
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/api/bond');
    const bond = await response.json();
    
    // 如果是初见状态，自动启动引导
    if (bond.factCount === 0 || bond.level === '初见') {
      setTimeout(() => {
        onboarding = new OnboardingFlow();
        onboarding.start();
      }, 1000);
    }
  } catch (error) {
    console.error('Failed to check onboarding status:', error);
  }
});

// 手动触发引导（用于测试或重新引导）
window.startOnboarding = () => {
  onboarding = new OnboardingFlow();
  onboarding.start();
};
