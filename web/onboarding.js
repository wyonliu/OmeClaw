// ========== OmeClaw 60秒魔法引导 ==========
// 新用户首次体验优化

class OnboardingFlow {
  constructor() {
    this.currentStep = 0;
    this.userData = {
      agentName: '',
      userTitle: '',
      firstMessage: ''
    };
  }

  async start() {
    // 检查是否已完成引导
    if (localStorage.getItem('omeclaw_onboarding_completed')) {
      return false;
    }

    // 显示引导界面
    this.showOnboardingUI();
    
    // 开始引导流程
    await this.step1_Welcome();
    return true;
  }

  showOnboardingUI() {
    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
      <div class="onboarding-container">
        <div class="onboarding-progress">
          <div class="progress-bar">
            <div class="progress-fill" id="onboarding-progress"></div>
          </div>
          <div class="progress-text">
            <span id="current-step">1</span> / 5
          </div>
        </div>
        <div class="onboarding-content" id="onboarding-content"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  updateProgress(step) {
    this.currentStep = step;
    const progress = (step / 5) * 100;
    $('#onboarding-progress').style.width = `${progress}%`;
    $('#current-step').textContent = step;
  }

  // Step 1: 欢迎页（5秒）
  async step1_Welcome() {
    this.updateProgress(1);
    
    const content = $('#onboarding-content');
    content.innerHTML = `
      <div class="onboarding-step fade-in">
        <div class="welcome-emoji">🪼</div>
        <h1 class="welcome-title">嘿！👋</h1>
        <p class="welcome-text">
          我是你的 AI 分身<br>
          我会记住你的一切<br>
          比你自己还了解你
        </p>
        <div class="welcome-animation">
          <div class="pulse-circle"></div>
          <div class="pulse-circle delay-1"></div>
          <div class="pulse-circle delay-2"></div>
        </div>
      </div>
    `;

    // 3秒后自动进入下一步
    await this.sleep(3000);
    await this.step2_NameAgent();
  }

  // Step 2: 起名字（10秒）
  async step2_NameAgent() {
    this.updateProgress(2);
    
    const content = $('#onboarding-content');
    content.innerHTML = `
      <div class="onboarding-step slide-up">
        <div class="step-emoji">✨</div>
        <h2 class="step-title">先给我起个名字吧~</h2>
        <p class="step-subtitle">这样我就有身份啦</p>
        
        <div class="name-input-container">
          <input 
            type="text" 
            id="agent-name-input" 
            class="name-input" 
            placeholder="比如：Jane, Momo, 小O..."
            maxlength="20"
          />
          <div class="name-suggestions">
            <span class="suggestion-chip" data-name="Jane">Jane</span>
            <span class="suggestion-chip" data-name="Momo">Momo</span>
            <span class="suggestion-chip" data-name="小O">小O</span>
            <span class="suggestion-chip" data-name="Luna">Luna</span>
          </div>
        </div>
        
        <button class="onboarding-btn" id="name-next-btn" disabled>
          下一步 →
        </button>
      </div>
    `;

    // 绑定事件
    const input = $('#agent-name-input');
    const nextBtn = $('#name-next-btn');
    
    input.addEventListener('input', (e) => {
      const value = e.target.value.trim();
      nextBtn.disabled = value.length === 0;
      if (value.length > 0) {
        nextBtn.classList.add('active');
      } else {
        nextBtn.classList.remove('active');
      }
    });

    // 建议芯片点击
    $$('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.name;
        input.dispatchEvent(new Event('input'));
        input.focus();
      });
    });

    // 下一步按钮
    await new Promise(resolve => {
      nextBtn.addEventListener('click', () => {
        this.userData.agentName = input.value.trim();
        resolve();
      });
    });

    await this.step3_SetTitle();
  }

  // Step 3: 设置称呼（10秒）
  async step3_SetTitle() {
    this.updateProgress(3);
    
    const content = $('#onboarding-content');
    content.innerHTML = `
      <div class="onboarding-step slide-up">
        <div class="step-emoji">👤</div>
        <h2 class="step-title">那我该怎么叫你呢？</h2>
        <p class="step-subtitle">${this.userData.agentName} 想知道~</p>
        
        <div class="name-input-container">
          <input 
            type="text" 
            id="user-title-input" 
            class="name-input" 
            placeholder="比如：主人, 老板, 朋友..."
            maxlength="20"
          />
          <div class="name-suggestions">
            <span class="suggestion-chip" data-name="主人">主人</span>
            <span class="suggestion-chip" data-name="老板">老板</span>
            <span class="suggestion-chip" data-name="朋友">朋友</span>
            <span class="suggestion-chip" data-name="伙伴">伙伴</span>
          </div>
        </div>
        
        <button class="onboarding-btn" id="title-next-btn" disabled>
          下一步 →
        </button>
      </div>
    `;

    // 绑定事件（同上）
    const input = $('#user-title-input');
    const nextBtn = $('#title-next-btn');
    
    input.addEventListener('input', (e) => {
      const value = e.target.value.trim();
      nextBtn.disabled = value.length === 0;
      if (value.length > 0) {
        nextBtn.classList.add('active');
      } else {
        nextBtn.classList.remove('active');
      }
    });

    $$('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.name;
        input.dispatchEvent(new Event('input'));
        input.focus();
      });
    });

    await new Promise(resolve => {
      nextBtn.addEventListener('click', () => {
        this.userData.userTitle = input.value.trim();
        resolve();
      });
    });

    await this.step4_FirstConversation();
  }

  // Step 4: 第一次对话（20秒）
  async step4_FirstConversation() {
    this.updateProgress(4);
    
    const content = $('#onboarding-content');
    content.innerHTML = `
      <div class="onboarding-step slide-up">
        <div class="step-emoji">💬</div>
        <h2 class="step-title">来，跟我说说你今天怎么样？</h2>
        <p class="step-subtitle">随便聊聊，让我开始了解你~</p>
        
        <div class="first-chat-container">
          <textarea 
            id="first-message-input" 
            class="first-message-input" 
            placeholder="比如：今天心情不错，刚完成了一个项目..."
            rows="4"
          ></textarea>
          
          <div class="input-tips">
            <span class="tip">💡 提示：说说你的心情、今天做了什么、或者任何想聊的</span>
          </div>
        </div>
        
        <button class="onboarding-btn" id="chat-next-btn" disabled>
          发送 →
        </button>
      </div>
    `;

    const input = $('#first-message-input');
    const nextBtn = $('#chat-next-btn');
    
    input.addEventListener('input', (e) => {
      const value = e.target.value.trim();
      nextBtn.disabled = value.length < 5;
      if (value.length >= 5) {
        nextBtn.classList.add('active');
      } else {
        nextBtn.classList.remove('active');
      }
    });

    await new Promise(resolve => {
      nextBtn.addEventListener('click', async () => {
        this.userData.firstMessage = input.value.trim();
        
        // 显示加载状态
        nextBtn.disabled = true;
        nextBtn.innerHTML = '<div class="btn-loading"></div> 正在理解...';
        
        // 发送第一条消息到后端
        try {
          await this.sendFirstMessage();
          resolve();
        } catch (e) {
          console.error('发送消息失败:', e);
          resolve(); // 即使失败也继续
        }
      });
    });

    await this.step5_Surprise();
  }

  // Step 5: 惊喜反馈（15秒）
  async step5_Surprise() {
    this.updateProgress(5);
    
    const content = $('#onboarding-content');
    content.innerHTML = `
      <div class="onboarding-step fade-in">
        <div class="surprise-animation">
          <div class="memory-planet-birth">
            <canvas id="planet-canvas" width="200" height="200"></canvas>
          </div>
        </div>
        
        <h2 class="step-title celebration">记住了！✨</h2>
        <p class="step-subtitle">
          我们的记忆星球开始生长了<br>
          我会永远记住你说的每一句话
        </p>
        
        <div class="memory-stats">
          <div class="stat-item">
            <div class="stat-value">1</div>
            <div class="stat-label">记忆碎片</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">10 XP</div>
            <div class="stat-label">经验值</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">🫧</div>
            <div class="stat-label">初见</div>
          </div>
        </div>
        
        <button class="onboarding-btn active celebration-btn" id="complete-btn">
          开始我们的旅程 🚀
        </button>
      </div>
    `;

    // 绘制记忆星球诞生动画
    this.animateMemoryPlanetBirth();

    // 完成按钮
    await new Promise(resolve => {
      $('#complete-btn').addEventListener('click', resolve);
    });

    await this.completeOnboarding();
  }

  // 发送第一条消息
  async sendFirstMessage() {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: this.userData.firstMessage,
        sessionId: 'owner',
        metadata: {
          isFirstMessage: true,
          agentName: this.userData.agentName,
          userTitle: this.userData.userTitle,
        }
      })
    });

    if (!response.ok) throw new Error('发送失败');
    
    const data = await response.json();
    return data;
  }

  // 记忆星球诞生动画
  animateMemoryPlanetBirth() {
    const canvas = $('#planet-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    
    let frame = 0;
    const maxFrames = 60;
    
    const animate = () => {
      if (frame >= maxFrames) return;
      
      ctx.clearRect(0, 0, w, h);
      
      // 星空背景
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const alpha = Math.random() * 0.5;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(x, y, 1, 1);
      }
      
      // 星球生长
      const progress = frame / maxFrames;
      const r = 70 * progress;
      
      // 渐变
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, '#7c6cf0');
      gradient.addColorStop(1, '#4d9fff');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      
      // 光晕
      ctx.strokeStyle = `rgba(124, 108, 240, ${0.3 * progress})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
      ctx.stroke();
      
      frame++;
      requestAnimationFrame(animate);
    };
    
    animate();
  }

  // 完成引导
  async completeOnboarding() {
    // 保存引导数据
    localStorage.setItem('omeclaw_onboarding_completed', 'true');
    localStorage.setItem('omeclaw_agent_name', this.userData.agentName);
    localStorage.setItem('omeclaw_user_title', this.userData.userTitle);
    
    // 保存到后端
    await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.userData)
    });
    
    // 移除引导界面
    const overlay = $('#onboarding-overlay');
    overlay.classList.add('fade-out');
    
    await this.sleep(500);
    overlay.remove();
    
    // 显示欢迎消息
    showToast(`欢迎，${this.userData.userTitle}！${this.userData.agentName} 已经准备好陪伴你了 🎉`, 'success');
    
    // 刷新界面
    location.reload();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 页面加载时自动启动引导
window.addEventListener('DOMContentLoaded', async () => {
  const onboarding = new OnboardingFlow();
  await onboarding.start();
});
