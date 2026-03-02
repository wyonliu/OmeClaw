// 用户系统和 Ome 领养前端逻辑

class AuthSystem {
  constructor() {
    this.token = localStorage.getItem('omeclaw_token');
    this.user = null;
    this.omeId = null;
  }

  async init() {
    if (this.token) {
      const verified = await this.verifyToken();
      if (verified) {
        return true;
      }
    }
    this.showAuthPage();
    return false;
  }

  async verifyToken() {
    try {
      const response = await fetch('/api/auth/verify', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await response.json();
      if (data.ok) {
        this.user = data.user;
        this.omeId = data.omeId;
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  showAuthPage() {
    const overlay = document.createElement('div');
    overlay.className = 'auth-page';
    overlay.id = 'auth-page';
    overlay.innerHTML = `
      <div class="auth-container">
        <div class="auth-logo">🪼</div>
        <h2 class="auth-title">欢迎来到 OmeClaw</h2>
        <p class="auth-subtitle">领养你的专属 AI 分身</p>
        
        <div id="auth-error" class="auth-error" style="display:none"></div>
        
        <form id="auth-form" class="auth-form">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input type="text" id="auth-username" class="form-input" placeholder="3-20个字符" required>
          </div>
          
          <div class="form-group" id="email-group" style="display:none">
            <label class="form-label">邮箱（可选）</label>
            <input type="email" id="auth-email" class="form-input" placeholder="your@email.com">
          </div>
          
          <div class="form-group">
            <label class="form-label">密码</label>
            <input type="password" id="auth-password" class="form-input" placeholder="至少6个字符" required>
          </div>
          
          <button type="submit" class="auth-button" id="auth-submit">登录</button>
        </form>
        
        <div class="auth-switch">
          <span id="auth-switch-text">还没有账号？</span>
          <a class="auth-switch-link" id="auth-switch-link">立即注册</a>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let isRegister = false;
    const form = document.getElementById('auth-form');
    const submitBtn = document.getElementById('auth-submit');
    const switchLink = document.getElementById('auth-switch-link');
    const switchText = document.getElementById('auth-switch-text');
    const emailGroup = document.getElementById('email-group');
    const errorDiv = document.getElementById('auth-error');

    switchLink.addEventListener('click', () => {
      isRegister = !isRegister;
      if (isRegister) {
        submitBtn.textContent = '注册';
        switchText.textContent = '已有账号？';
        switchLink.textContent = '立即登录';
        emailGroup.style.display = 'block';
      } else {
        submitBtn.textContent = '登录';
        switchText.textContent = '还没有账号？';
        switchLink.textContent = '立即注册';
        emailGroup.style.display = 'none';
      }
      errorDiv.style.display = 'none';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorDiv.style.display = 'none';
      
      const username = document.getElementById('auth-username').value.trim();
      const password = document.getElementById('auth-password').value;
      const email = document.getElementById('auth-email').value.trim();

      submitBtn.disabled = true;
      submitBtn.textContent = isRegister ? '注册中...' : '登录中...';

      try {
        const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
        const body = isRegister ? { username, password, email } : { username, password };
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.ok) {
          this.token = data.token;
          this.user = { username };
          this.omeId = data.omeId;
          localStorage.setItem('omeclaw_token', data.token);
          
          overlay.remove();
          
          if (isRegister) {
            // 注册成功，显示领养页面
            this.showAdoptionPage();
          } else {
            // 登录成功，刷新页面
            window.location.reload();
          }
        } else {
          errorDiv.textContent = data.error || '操作失败';
          errorDiv.style.display = 'block';
        }
      } catch (error) {
        errorDiv.textContent = '网络错误，请重试';
        errorDiv.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isRegister ? '注册' : '登录';
      }
    });
  }

  async showAdoptionPage() {
    // 获取模板
    const response = await fetch('/api/ome/templates');
    const { templates } = await response.json();

    const overlay = document.createElement('div');
    overlay.className = 'adoption-page';
    overlay.id = 'adoption-page';
    overlay.innerHTML = `
      <div class="adoption-container">
        <div class="adoption-header">
          <div class="adoption-emoji">🪼</div>
          <h2 class="adoption-title">选择你的 Ome</h2>
          <p class="adoption-subtitle">每个 Ome 都有独特的性格和特长</p>
        </div>
        
        <div class="template-grid" id="template-grid">
          ${templates.map(t => `
            <div class="template-card" data-template="${t.id}">
              <div class="template-avatar">${t.avatar}</div>
              <div class="template-name">${t.name}</div>
              <div class="template-desc">${t.description}</div>
              <div class="template-traits">
                ${t.personality.traits.slice(0, 3).map(trait => 
                  `<span class="trait-tag">${trait}</span>`
                ).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        
        <div class="customize-section">
          <h3 class="customize-title">个性化设置</h3>
          <div class="form-group">
            <label class="form-label">给 Ome 起个名字</label>
            <input type="text" id="ome-name" class="form-input" placeholder="留空使用默认名称">
          </div>
        </div>
        
        <div class="adoption-actions">
          <button class="btn-adopt" id="btn-adopt">领养 Ome 🎉</button>
          <button class="btn-skip" id="btn-skip">稍后设置</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let selectedTemplate = templates[0].id;

    // 模板选择
    document.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedTemplate = card.dataset.template;
      });
    });
    document.querySelector('.template-card').classList.add('selected');

    // 领养按钮
    document.getElementById('btn-adopt').addEventListener('click', async () => {
      const customName = document.getElementById('ome-name').value.trim();
      
      try {
        const response = await fetch('/api/ome/adopt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify({
            templateId: selectedTemplate,
            customName: customName || undefined
          })
        });

        const data = await response.json();
        if (data.ok) {
          overlay.remove();
          window.location.reload();
        }
      } catch (error) {
        alert('领养失败，请重试');
      }
    });

    // 跳过按钮
    document.getElementById('btn-skip').addEventListener('click', () => {
      overlay.remove();
      window.location.reload();
    });
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
    } catch (e) {}
    
    localStorage.removeItem('omeclaw_token');
    this.token = null;
    this.user = null;
    this.omeId = null;
    window.location.reload();
  }

  getToken() {
    return this.token;
  }

  getOmeId() {
    return this.omeId;
  }
}

// 全局实例
window.authSystem = new AuthSystem();

// 页面加载时初始化
window.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await window.authSystem.init();
  if (authenticated) {
    console.log('用户已登录');
  }
});
