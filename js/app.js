import { RegistrationModule } from './modules/registration.js';
import { DrawModule } from './modules/draw.js';
import { MatchModule } from './modules/match.js';
import { HistoryModule } from './modules/history.js';
import { LiveModule } from './modules/live.js';
import { UsersModule } from './modules/users.js';

class App {
  constructor() {
    this.store = { teams: [], tournament: null, pastTournaments: [] };
    this.modules = {};
    this.ws = null;
    this.currentUser = null;
    this.token = localStorage.getItem('hoops_token') || null;
    this.authEventsInitialized = false;
    
    // 启动异步初始化过程
    this.bootstrap();
  }

  async bootstrap() {
    const isAuthed = await this.checkAuth();
    if (isAuthed) {
      this.showMainApp();
      await this.loadStore();
      this.init();
      this.connectWebSocket();
    } else {
      this.showAuth();
    }
  }

  async checkAuth() {
    if (!this.token) return false;
    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (response.ok) {
        const json = await response.json();
        if (json.success && json.user) {
          this.currentUser = json.user;
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('鉴权请求失败:', err);
      return false;
    }
  }

  showMainApp() {
    document.querySelector('.app-container').style.display = 'flex';
    document.getElementById('auth-container').style.display = 'none';
  }

  showAuth() {
    document.querySelector('.app-container').style.display = 'none';
    document.getElementById('auth-container').style.display = 'flex';
    this.initAuthEvents();
  }

  initAuthEvents() {
    if (this.authEventsInitialized) return;
    this.authEventsInitialized = true;

    const loginWrapper = document.getElementById('login-form-wrapper');
    const registerWrapper = document.getElementById('register-form-wrapper');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    // 切换登录/注册
    document.getElementById('go-to-register').addEventListener('click', (e) => {
      e.preventDefault();
      loginWrapper.style.display = 'none';
      registerWrapper.style.display = 'block';
    });
    document.getElementById('go-to-login').addEventListener('click', (e) => {
      e.preventDefault();
      registerWrapper.style.display = 'none';
      loginWrapper.style.display = 'block';
    });

    // 登录提交
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const json = await res.json();
        if (json.success && json.token) {
          localStorage.setItem('hoops_token', json.token);
          this.token = json.token;
          this.currentUser = json.user;
          
          this.showMainApp();
          await this.loadStore();
          this.init();
          this.connectWebSocket();
        } else {
          alert(`登录失败: ${json.error}`);
        }
      } catch (err) {
        console.error(err);
        alert('登录请求失败，请稍后重试');
      }
    });

    // 注册表单实时校验与事件绑定
    const regUsernameInput = document.getElementById('register-username');
    const regNicknameInput = document.getElementById('register-nickname');
    const regPasswordInput = document.getElementById('register-password');
    const regConfirmInput = document.getElementById('register-confirm-password');

    const usernameError = document.getElementById('register-username-error');
    const nicknameError = document.getElementById('register-nickname-error');
    const passwordError = document.getElementById('register-password-error');
    const confirmError = document.getElementById('register-confirm-password-error');

    const validateUsername = (val) => {
      const regex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!val) return '用户名不能为空';
      if (!regex.test(val)) return '用户名须为3-20位英文、数字或下划线';
      return '';
    };

    const validateNickname = (val) => {
      if (!val) return '昵称不能为空';
      if (val.length < 2 || val.length > 10) return '昵称长度须在2至10位之间';
      return '';
    };

    const validatePassword = (val) => {
      if (!val) return '密码不能为空';
      if (val.length < 6 || val.length > 20) return '密码长度须在6至20位之间';
      return '';
    };

    const validateConfirmPassword = (val, pwd) => {
      if (!val) return '请再次输入密码以确认';
      if (val !== pwd) return '两次输入的密码不一致';
      return '';
    };

    const updateFieldStatus = (inputEl, errorEl, errorMsg) => {
      if (errorMsg) {
        inputEl.classList.add('invalid');
        inputEl.classList.remove('valid');
        errorEl.textContent = errorMsg;
        errorEl.classList.add('visible');
      } else {
        inputEl.classList.remove('invalid');
        inputEl.classList.add('valid');
        errorEl.textContent = '';
        errorEl.classList.remove('visible');
      }
    };

    regUsernameInput.addEventListener('input', () => {
      const val = regUsernameInput.value.trim();
      updateFieldStatus(regUsernameInput, usernameError, validateUsername(val));
    });

    regNicknameInput.addEventListener('input', () => {
      const val = regNicknameInput.value.trim();
      updateFieldStatus(regNicknameInput, nicknameError, validateNickname(val));
    });

    regPasswordInput.addEventListener('input', () => {
      const val = regPasswordInput.value;
      updateFieldStatus(regPasswordInput, passwordError, validatePassword(val));
      if (regConfirmInput.value) {
        updateFieldStatus(regConfirmInput, confirmError, validateConfirmPassword(regConfirmInput.value, val));
      }
    });

    regConfirmInput.addEventListener('input', () => {
      const val = regConfirmInput.value;
      const pwd = regPasswordInput.value;
      updateFieldStatus(regConfirmInput, confirmError, validateConfirmPassword(val, pwd));
    });

    // 注册提交
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = regUsernameInput.value.trim();
      const nickname = regNicknameInput.value.trim();
      const password = regPasswordInput.value;
      const confirmPassword = regConfirmInput.value;

      const errUser = validateUsername(username);
      const errNick = validateNickname(nickname);
      const errPass = validatePassword(password);
      const errConfirm = validateConfirmPassword(confirmPassword, password);

      updateFieldStatus(regUsernameInput, usernameError, errUser);
      updateFieldStatus(regNicknameInput, nicknameError, errNick);
      updateFieldStatus(regPasswordInput, passwordError, errPass);
      updateFieldStatus(regConfirmInput, confirmError, errConfirm);

      if (errUser || errNick || errPass || errConfirm) {
        if (errUser) regUsernameInput.focus();
        else if (errNick) regNicknameInput.focus();
        else if (errPass) regPasswordInput.focus();
        else if (errConfirm) regConfirmInput.focus();
        return;
      }

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, nickname, password, confirmPassword })
        });
        const json = await res.json();
        if (json.success) {
          // 自动登录
          const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });
          const loginJson = await loginRes.json();
          if (loginJson.success && loginJson.token) {
            localStorage.setItem('hoops_token', loginJson.token);
            this.token = loginJson.token;
            this.currentUser = loginJson.user;
            
            this.showMainApp();
            await this.loadStore();
            this.init();
            this.connectWebSocket();
          } else {
            alert('自动登录失败，请手动登录');
            registerWrapper.style.display = 'none';
            loginWrapper.style.display = 'block';
          }
        } else {
          if (json.error && json.error.includes('已存在')) {
            updateFieldStatus(regUsernameInput, usernameError, '用户名已存在，请换一个');
            regUsernameInput.focus();
          } else {
            alert(`注册失败: ${json.error}`);
          }
        }
      } catch (err) {
        console.error(err);
        alert('注册请求失败，请稍后重试');
      }
    });
  }

  // 统一包装带 Token 的 API 请求
  async fetchApi(url, options = {}) {
    if (!options.headers) {
      options.headers = {};
    }
    if (this.token) {
      options.headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    try {
      const response = await fetch(url, options);
      if (response.status === 401) {
        console.warn('会话已过期，重定向到登录页');
        this.logout();
        throw new Error('会话过期，请重新登录');
      }
      return response;
    } catch (err) {
      throw err;
    }
  }

  logout() {
    localStorage.removeItem('hoops_token');
    this.token = null;
    this.currentUser = null;
    
    this.showAuth();
    
    setTimeout(() => {
      location.reload();
    }, 100);
  }

  async loadStore() {
    try {
      const response = await this.fetchApi('/api/store');
      if (response.ok) {
        const json = await response.json();
        if (json.success && json.data) {
          this.store = json.data;
          if (!this.store.teams) this.store.teams = [];
          if (!this.store.pastTournaments) this.store.pastTournaments = [];
          return;
        }
      }
    } catch (err) {
      console.warn('无法连接到后端数据库，降级使用空数据', err);
    }
  }

  async saveStore(key, value) {
    this.store[key] = value;
    
    // 异步写入数据库（不阻塞 UI）
    try {
      this.fetchApi('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.store)
      }).catch(err => {
        console.error('写入数据库请求失败:', err);
      });
    } catch (err) {
      console.error('保存到后端数据库失败', err);
    }
  }


  // 建立 WebSocket 实时同步长连接
  connectWebSocket() {
    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}`;
      console.log(`🔌 正在连接实时比分同步服务: ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('📡 实时比分同步连接已建立');
        // 将连接断开期间排队的请求重发
        if (this.wsQueue && this.wsQueue.length > 0) {
          this.wsQueue.forEach(msg => this.sendWsMessage(msg.type, msg.payload));
          this.wsQueue = [];
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'STATE_SYNC') {
            if (this.modules.live) {
              this.modules.live.onStateSync(message.payload);
            }
          } else if (message.type === 'DANMAKU') {
            if (this.modules.live) {
              this.modules.live.onDanmakuReceived(message.payload);
            }
          } else if (message.type === 'CONTROL_RESPONSE') {
            if (this.modules.match) {
              this.modules.match.onControlResponse(message.payload);
            }
          } else if (message.type === 'CONTROL_LOST') {
            if (this.modules.match) {
              this.modules.match.onControlLost(message.payload);
            }
          }
        } catch (e) {
          console.error('解析服务器同步包失败:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.error('实时同步通信发生错误:', err);
      };

      this.ws.onclose = () => {
        console.warn('实时同步连接已断开，3秒后自动尝试重连...');
        setTimeout(() => this.connectWebSocket(), 3000);
      };
    } catch (e) {
      console.error('初始化 WebSocket 连接失败，3秒后尝试重连...', e);
      setTimeout(() => this.connectWebSocket(), 3000);
    }
  }

  // 发送消息到实时比分同步服务器
  sendWsMessage(type, payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('同步连接处于不可用状态，消息已放入队列:', type);
      if (!this.wsQueue) this.wsQueue = [];
      this.wsQueue.push({ type, payload });
    }
  }

  init() {
    // 实例化模块
    this.modules.registration = new RegistrationModule(this);
    this.modules.draw = new DrawModule(this);
    this.modules.match = new MatchModule(this);
    this.modules.history = new HistoryModule(this);
    this.modules.live = new LiveModule(this);
    this.modules.users = new UsersModule(this);

    // 绑定导航事件
    const navMenu = document.querySelector('.nav-menu');
    document.querySelectorAll('.nav-item').forEach(nav => {
      nav.addEventListener('click', (e) => {
        const targetId = e.currentTarget.dataset.target;
        this.switchView(targetId);
        // 点击导航菜单项后自动收起下拉菜单
        if (navMenu) {
          navMenu.classList.remove('open');
        }
      });
    });

    // 绑定汉堡菜单切换（移动端）
    const menuToggle = document.getElementById('menu-toggle-btn');
    if (menuToggle && navMenu) {
      menuToggle.addEventListener('click', () => {
        navMenu.classList.toggle('open');
      });
    }

    // 绑定注销事件
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        if (confirm('确定要退出当前登录账号吗？')) {
          this.logout();
        }
      });
    }

    // 初始化个人用户信息展示
    this.updateUserInfoDisplay();

    // 初始化个人资料设置事件
    this.initProfileSettings();

    // 绑定全局重置事件
    document.getElementById('reset-all-btn').addEventListener('click', async () => {
      if(confirm('警告：这将会清除所有报名队伍和比赛记录！确定要继续吗？')) {
        await this.saveStore('teams', []);
        await this.saveStore('tournament', null);
        await this.saveStore('pastTournaments', []);
        localStorage.removeItem('hoops_manager_current_view');
        localStorage.removeItem('hoops_manager_active_match_id');
        localStorage.removeItem('hoops_manager_live_match');
        this.sendWsMessage('MATCH_END', {}); // 重置时清除同步比分
        setTimeout(() => location.reload(), 300); // 稍等片刻等待请求发送后刷新
      }
    });

    // 🕵️‍♂️ 隐藏后门：3秒内连点 5 次侧边栏 Logo 触发暗号输入
    const logoArea = document.querySelector('.sidebar .logo');
    if (logoArea) {
      let clickCount = 0;
      let clickTimer = null;
      logoArea.addEventListener('click', () => {
        clickCount++;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          clickCount = 0;
        }, 3000);
        
        if (clickCount >= 5) {
          clickCount = 0;
          const code = prompt('🔑 进入系统高级控制：请输入管理员重置暗号：');
          if (code === 'admin') {
            const resetBtn = document.getElementById('reset-all-btn');
            if (resetBtn) {
              resetBtn.click();
            }
          } else if (code !== null) {
            alert('❌ 暗号错误，无权进行重置操作！');
          }
        }
      });
    }

    // 恢复上次访问的页面和比赛状态
    const savedView = localStorage.getItem('hoops_manager_current_view') || 'registration';
    const activeMatchId = localStorage.getItem('hoops_manager_active_match_id');

    if (savedView === 'match' && activeMatchId && this.store.tournament && this.store.tournament.currentMatches) {
      const match = this.store.tournament.currentMatches.find(m => m.id === activeMatchId);
      if (match && !match.completed) {
        this.startMatch(match, true);
        return;
      }
    }
    
    // 如果上次保存的视图是 users，但当前是非管理员，则强制跳到报名管理页面
    if (savedView === 'users' && (!this.currentUser || this.currentUser.role !== 'admin')) {
      this.switchView('registration');
    } else {
      this.switchView(savedView);
    }
  }

  switchView(viewId) {
    // 保存当前视图状态
    localStorage.setItem('hoops_manager_current_view', viewId);

    // 隐藏所有视图
    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.remove('active');
    });

    // 移除导航激活状态
    document.querySelectorAll('.nav-item').forEach(nav => {
      nav.classList.remove('active');
    });

    // 激活目标视图
    const targetSection = document.getElementById(viewId);
    if (targetSection) {
      targetSection.classList.add('active');
      const navBtn = document.querySelector(`.nav-item[data-target="${viewId}"]`);
      if (navBtn) navBtn.classList.add('active');
    }

    // 触发对应模块的更新
    if (viewId === 'registration') {
      this.modules.registration.render();
    } else if (viewId === 'tournament') {
      this.modules.draw.render();
    } else if (viewId === 'history') {
      this.modules.history.render();
    } else if (viewId === 'profile') {
      if (this.currentUser) {
        document.getElementById('profile-username').value = this.currentUser.username;
        document.getElementById('profile-nickname').value = this.currentUser.nickname;
        
        // 重置密码输入框的值及状态
        const oldPwd = document.getElementById('profile-old-password');
        const newPwd = document.getElementById('profile-new-password');
        const confirmPwd = document.getElementById('profile-confirm-password');
        const nickInput = document.getElementById('profile-nickname');
        
        if (oldPwd && newPwd && confirmPwd && nickInput) {
          oldPwd.value = '';
          newPwd.value = '';
          confirmPwd.value = '';
          [nickInput, oldPwd, newPwd, confirmPwd].forEach(input => input.classList.remove('valid', 'invalid'));
        }
        
        ['profile-nickname-error', 'profile-old-password-error', 'profile-new-password-error', 'profile-confirm-password-error'].forEach(errId => {
          const err = document.getElementById(errId);
          if (err) {
            err.textContent = '';
            err.classList.remove('visible');
          }
        });
      }
    } else if (viewId === 'users') {
      if (this.currentUser && this.currentUser.role === 'admin') {
        this.modules.users.loadUserList();
      } else {
        this.switchView('registration');
      }
    } else if (viewId === 'match') {
      // 拦截未选择比赛时直接进入控制台
      if (!this.modules.match.currentMatch) {
        this.modules.match.showOverlay('empty', '没有比赛控制中', '请先在“抽签对阵”页面选择一场比赛进入控制。');
      }
    }
  }

  startMatch(match, isRestore = false) {
    this.modules.match.loadMatch(match, isRestore);
    localStorage.setItem('hoops_manager_active_match_id', match.id);
    this.switchView('match');
  }

  getClientId() {
    let clientId = sessionStorage.getItem('hoops_client_id');
    if (!clientId) {
      clientId = 'client_' + Math.random().toString(36).substring(2, 11);
      sessionStorage.setItem('hoops_client_id', clientId);
    }
    return clientId;
  }

  updateUserInfoDisplay() {
    const userInfoEl = document.getElementById('current-user-info');
    const nicknameDisplay = document.getElementById('user-nickname-display');
    const roleDisplay = document.getElementById('user-role-display');
    const navUsersBtn = document.getElementById('nav-users-btn');

    if (userInfoEl && nicknameDisplay && roleDisplay && this.currentUser) {
      userInfoEl.style.display = 'flex';
      nicknameDisplay.textContent = this.currentUser.nickname;
      roleDisplay.textContent = this.currentUser.role === 'admin' ? '管理员' : '球员';
    }

    if (navUsersBtn && this.currentUser) {
      if (this.currentUser.role === 'admin') {
        navUsersBtn.style.display = 'flex';
      } else {
        navUsersBtn.style.display = 'none';
      }
    }
  }

  initProfileSettings() {
    const form = document.getElementById('profile-settings-form');

    const usernameInput = document.getElementById('profile-username');
    const nicknameInput = document.getElementById('profile-nickname');
    const oldPasswordInput = document.getElementById('profile-old-password');
    const newPasswordInput = document.getElementById('profile-new-password');
    const confirmPasswordInput = document.getElementById('profile-confirm-password');

    const nicknameError = document.getElementById('profile-nickname-error');
    const oldPasswordError = document.getElementById('profile-old-password-error');
    const newPasswordError = document.getElementById('profile-new-password-error');
    const confirmPasswordError = document.getElementById('profile-confirm-password-error');

    if (!form) return;

    // 实时校验辅助函数
    const updateStatus = (inputEl, errorEl, msg) => {
      if (!inputEl || !errorEl) return;
      if (msg) {
        inputEl.classList.add('invalid');
        inputEl.classList.remove('valid');
        errorEl.textContent = msg;
        errorEl.classList.add('visible');
      } else {
        inputEl.classList.remove('invalid');
        inputEl.classList.add('valid');
        errorEl.textContent = '';
        errorEl.classList.remove('visible');
      }
    };

    nicknameInput.addEventListener('input', () => {
      const val = nicknameInput.value.trim();
      if (!val) updateStatus(nicknameInput, nicknameError, '昵称不能为空');
      else if (val.length < 2 || val.length > 10) updateStatus(nicknameInput, nicknameError, '昵称长度须在2至10位之间');
      else updateStatus(nicknameInput, nicknameError, '');
    });

    const validatePasswords = () => {
      const oldVal = oldPasswordInput.value;
      const newVal = newPasswordInput.value;
      const confirmVal = confirmPasswordInput.value;

      let errOld = '';
      let errNew = '';
      let errConfirm = '';

      if (newVal || oldVal || confirmVal) {
        if (!oldVal) errOld = '请输入当前密码';
        if (!newVal) errNew = '请输入新密码';
        else if (newVal.length < 6 || newVal.length > 20) errNew = '密码长度须在6至20位之间';
        
        if (newVal && confirmVal && newVal !== confirmVal) {
          errConfirm = '两次输入的新密码不一致';
        } else if (!confirmVal && newVal) {
          errConfirm = '请确认新密码';
        }
      }

      updateStatus(oldPasswordInput, oldPasswordError, errOld);
      updateStatus(newPasswordInput, newPasswordError, errNew);
      updateStatus(confirmPasswordInput, confirmPasswordError, errConfirm);

      return { errOld, errNew, errConfirm };
    };

    oldPasswordInput.addEventListener('input', validatePasswords);
    newPasswordInput.addEventListener('input', validatePasswords);
    confirmPasswordInput.addEventListener('input', validatePasswords);

    // 提交保存
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nickname = nicknameInput.value.trim();
      const oldPassword = oldPasswordInput.value;
      const newPassword = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      // 前端校验
      let hasError = false;
      if (!nickname) {
        updateStatus(nicknameInput, nicknameError, '昵称不能为空');
        hasError = true;
      } else if (nickname.length < 2 || nickname.length > 10) {
        updateStatus(nicknameInput, nicknameError, '昵称长度须在2至10位之间');
        hasError = true;
      } else {
        updateStatus(nicknameInput, nicknameError, '');
      }

      const pwdErrors = validatePasswords();
      if (pwdErrors.errOld || pwdErrors.errNew || pwdErrors.errConfirm) {
        hasError = true;
      }

      if (hasError) {
        if (nicknameError.classList.contains('visible')) nicknameInput.focus();
        else if (oldPasswordError.classList.contains('visible')) oldPasswordInput.focus();
        else if (newPasswordError.classList.contains('visible')) newPasswordInput.focus();
        else if (confirmPasswordError.classList.contains('visible')) confirmPasswordInput.focus();
        return;
      }

      try {
        // 1. 修改昵称
        if (nickname !== this.currentUser.nickname) {
          const resNick = await this.fetchApi('/api/auth/update-nickname', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname })
          });
          const jsonNick = await resNick.json();
          if (!jsonNick.success) {
            alert(`昵称修改失败: ${jsonNick.error}`);
            return;
          }
          this.currentUser.nickname = nickname;
        }

        // 2. 修改密码（若填写了）
        if (newPassword) {
          const resPwd = await this.fetchApi('/api/auth/update-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPassword, newPassword, confirmPassword })
          });
          const jsonPwd = await resPwd.json();
          if (!jsonPwd.success) {
            updateStatus(oldPasswordInput, oldPasswordError, jsonPwd.error || '密码修改失败');
            oldPasswordInput.focus();
            return;
          }
        }

        alert('账户资料保存成功！');
        
        // 保存成功后清空密码输入框
        oldPasswordInput.value = '';
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        [oldPasswordInput, newPasswordInput, confirmPasswordInput].forEach(inp => inp.classList.remove('valid', 'invalid'));
        
        this.updateUserInfoDisplay();
        
        // 如果是在大屏观战模块，联动刷新已加载卡片的昵称填充
        if (this.modules.live && this.modules.live.activeCards) {
          Object.keys(this.modules.live.activeCards).forEach(matchId => {
            const card = this.modules.live.activeCards[matchId];
            if (card && card.elements && card.elements.danmakuNicknameInput) {
              card.elements.danmakuNicknameInput.value = nickname;
            }
          });
        }
      } catch (err) {
        console.error(err);
        alert('保存账户资料请求失败，请稍后重试');
      }
    });
  }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();

  // 禁用双指缩放 (Pinch-to-zoom)
  document.addEventListener('touchstart', (event) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('touchmove', (event) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('gesturestart', (event) => {
    event.preventDefault();
  });
});
