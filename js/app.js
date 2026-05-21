import { RegistrationModule } from './modules/registration.js';
import { DrawModule } from './modules/draw.js';
import { MatchModule } from './modules/match.js';
import { HistoryModule } from './modules/history.js';
import { LiveModule } from './modules/live.js';

class App {
  constructor() {
    this.store = { teams: [], tournament: null, pastTournaments: [] };
    this.modules = {};
    this.ws = null;
    
    // 启动异步初始化过程
    this.bootstrap();
  }

  async bootstrap() {
    await this.loadStore();
    this.init();
    this.connectWebSocket();
  }

  async loadStore() {
    try {
      const response = await fetch('/api/store');
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
      fetch('/api/store', {
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
      console.warn('同步连接处于不可用状态，消息丢失:', type);
    }
  }

  init() {
    // 实例化模块
    this.modules.registration = new RegistrationModule(this);
    this.modules.draw = new DrawModule(this);
    this.modules.match = new MatchModule(this);
    this.modules.history = new HistoryModule(this);
    this.modules.live = new LiveModule(this);

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
    
    this.switchView(savedView);
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
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
