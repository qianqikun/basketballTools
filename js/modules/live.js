export class LiveModule {
  constructor(app) {
    this.app = app;
    // 维护当前所有的活动比赛卡片
    // 键是 matchId，值是包含 DOM 引用和该场时钟状态的对象
    this.activeCards = {};

    // 基础 DOM 容器
    this.emptyState = document.getElementById('live-empty-state');
    this.container = document.getElementById('live-active-matches');

    // 语音播放队列与状态初始化
    this.speechQueue = [];
    this.isSpeaking = false;

    // 监听物理返回键，用来自动退出网页模拟全屏或移动端伪横屏全屏
    window.addEventListener('popstate', (e) => {
      Object.keys(this.activeCards).forEach(matchId => {
        const card = this.activeCards[matchId];
        if (card) {
          if (card.isMobileLandscapeFs) {
            this.setMobileLandscapeFullscreen(matchId, false, false);
          } else if (card.isPseudoFs) {
            this.setPseudoFullscreen(matchId, false, false); // 第三个参数为 false，表示返回键触发，不需要再次后退历史栈
          }
        }
      });
    });
  }

  // 接收来自 app.js WebSocket 派发的多场比赛同步状态字典
  onStateSync(payload) {
    if (!payload || Object.keys(payload).length === 0) {
      // 没有任何正在进行的比赛，全部清除
      this.destroyAllCards();
      this.emptyState.style.display = 'flex';
      this.container.style.display = 'none';
      return;
    }

    // 展现容器
    this.emptyState.style.display = 'none';
    this.container.style.display = 'grid';

    const incomingIds = Object.keys(payload);

    // 1. 清理在本地存在但服务端已经没有的比赛（已完场）
    Object.keys(this.activeCards).forEach(localId => {
      if (!incomingIds.includes(localId)) {
        this.destroyCard(localId);
      }
    });

    // 2. 创建或更新比赛卡片
    incomingIds.forEach(matchId => {
      const matchData = payload[matchId];
      if (!this.activeCards[matchId]) {
        this.createCard(matchId, matchData);
      } else {
        this.updateCard(matchId, matchData);
      }
    });
  }

  // 动态创建单场比赛大屏卡片 DOM
  createCard(matchId, initialData) {
    const cardEl = document.createElement('div');
    cardEl.className = 'live-scoreboard-panel';
    cardEl.id = `live-card-${matchId}`;
    
    // 填充酷炫的 LED 骨架
    cardEl.innerHTML = `
      <!-- 动效跑马灯/横幅，用来播放高光事件 -->
      <div class="live-ticker-wrap">
        <div class="live-ticker-message">📡 实时数据同步连接成功 - 比赛直播中</div>
      </div>
      
      <div class="live-scoreboard-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; width: 100%;">
        <span class="live-round-tag" style="display: none;"></span>
        <span class="live-status-badge"><span class="pulse-dot"></span> 直播中</span>
      </div>

      <!-- 内容包裹容器 (用于支持有直播时的垂直上下布局) -->
      <div class="live-scoreboard-content">
        <div class="live-scoreboard-body">
          <!-- 客队 -->
          <div class="live-team-card away">
            <h2 class="live-team-name">客队</h2>
            <div class="live-score-value">00</div>
            <div class="live-stats-bar">
              <div class="live-stat-box">
                <span class="label">犯规</span>
                <span class="value">0</span>
              </div>
              <div class="live-stat-box">
                <span class="label">暂停</span>
                <span class="value">0</span>
              </div>
            </div>
          </div>

          <!-- 中央计时区域 -->
          <div class="live-center-col live-center-time">
            <div class="live-period">第 1 节</div>
            <div class="live-timer-clock">10:00</div>
            <div class="live-timer-state">已暂停</div>
          </div>

          <!-- 主队 -->
          <div class="live-team-card home">
            <h2 class="live-team-name">主队</h2>
            <div class="live-score-value">00</div>
            <div class="live-stats-bar">
              <div class="live-stat-box">
                <span class="label">犯规</span>
                <span class="value">0</span>
              </div>
              <div class="live-stat-box">
                <span class="label">暂停</span>
                <span class="value">0</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 视频播放区域 (新增) -->
        <div class="live-video-wrapper" style="display: none;">
          <!-- 全屏按钮 -->
          <button class="fullscreen-toggle-btn" title="网页全屏/退出"><i class='bx bx-fullscreen'></i></button>
          <!-- 声音控制按钮 -->
          <button class="volume-toggle-btn" title="静音/取消静音"><i class='bx bx-volume-mute'></i></button>
          
          <!-- 视频拉流状态占位 -->
          <div class="video-overlay">
            <i class='bx bx-loader-alt bx-spin'></i>
            <span>正在连接极速视频信号...</span>
          </div>
          <!-- 真正的 HTML5 Video 播放器 -->
          <video muted playsinline webkit-playsinline></video>
        </div>

        <!-- 弹幕展示容器 -->
        <div class="danmaku-container"></div>
        
        <!-- 弹幕控制与发送栏 (仅全屏时展示) -->
        <div class="live-danmaku-control-bar">
          <!-- 快捷推荐词区域 -->
          <div class="danmaku-shortcuts">
            <span class="danmaku-shortcut-item">🔥 666</span>
            <span class="danmaku-shortcut-item">👍 好球！</span>
            <span class="danmaku-shortcut-item">🏀 漂亮！</span>
            <span class="danmaku-shortcut-item">🛡️ 防守！</span>
            <span class="danmaku-shortcut-item">⚡ 绝杀！</span>
          </div>
          
          <div class="danmaku-input-row">
            <button class="danmaku-toggle-btn active" title="开启/关闭弹幕">
              <i class='bx bx-message-rounded-dots'></i>
            </button>
            <button class="danmaku-voice-toggle-btn active" title="开启/关闭弹幕语音">
              <i class='bx bx-volume-full'></i>
            </button>
            <select class="danmaku-voice-select" title="选择弹幕播报音色">
              <option value="zh-CN-YunjianNeural">🏀 云健 (男解说)</option>
              <option value="zh-CN-YunxiNeural">💬 云希 (活泼男)</option>
              <option value="zh-CN-YunyangNeural">🎙️ 云阳 (专业男)</option>
              <option value="zh-CN-XiaoxiaoNeural">👩 晓晓 (活泼女)</option>
              <option value="zh-CN-liaoning-XiaobeiNeural">⚡ 晓北 (辽宁女)</option>
              <option value="zh-CN-shaanxi-XiaoniNeural">🛡️ 晓妮 (陕西女)</option>
            </select>
            <button class="danmaku-history-toggle-btn" title="开启/关闭历史弹幕记录">
              <i class='bx bx-comment-detail'></i>
            </button>
            
            <div class="danmaku-color-selector">
              <span class="danmaku-color-dot active" data-color="#ffffff" style="background: #ffffff;"></span>
              <span class="danmaku-color-dot" data-color="#ff4d4f" style="background: #ff4d4f;"></span>
              <span class="danmaku-color-dot" data-color="#ffeb3b" style="background: #ffeb3b;"></span>
              <span class="danmaku-color-dot" data-color="#4caf50" style="background: #4caf50;"></span>
              <span class="danmaku-color-dot" data-color="#2196f3" style="background: #2196f3;"></span>
            </div>
            
            <input type="text" class="danmaku-nickname-input" placeholder="昵称" maxlength="10" />
            <input type="text" class="danmaku-input" placeholder="发个弹幕和大家一起聊球吧..." maxlength="50" />
            <button class="danmaku-send-btn">发送</button>
          </div>
        </div>
        
        <!-- 弹幕历史记录面板 (默认隐藏) -->
        <div class="danmaku-history-panel">
          <div class="history-panel-header">
            <h3>💬 弹幕记录</h3>
            <button class="history-close-btn" title="关闭"><i class='bx bx-x'></i></button>
          </div>
          <div class="history-panel-body">
            <ul class="history-list"></ul>
          </div>
        </div>
      </div>
    `;

    // 缓存卡片内部的 DOM 节点引用，避免后续查找性能损耗
    const body = cardEl.querySelector('.live-scoreboard-body');
    const elements = {
      tickerWrap: cardEl.querySelector('.live-ticker-wrap'),
      tickerMsg: cardEl.querySelector('.live-ticker-message'),
      roundName: cardEl.querySelector('.live-round-tag'),
      
      videoWrapper: cardEl.querySelector('.live-video-wrapper'),
      videoOverlay: cardEl.querySelector('.video-overlay'),
      videoElement: cardEl.querySelector('.live-video-wrapper video'),
      fullscreenBtn: cardEl.querySelector('.fullscreen-toggle-btn'),
      volumeBtn: cardEl.querySelector('.volume-toggle-btn'),

      // 弹幕相关 DOM
      danmakuContainer: cardEl.querySelector('.danmaku-container'),
      danmakuBar: cardEl.querySelector('.live-danmaku-control-bar'),
      danmakuToggleBtn: cardEl.querySelector('.live-danmaku-control-bar .danmaku-toggle-btn'),
      danmakuVoiceToggleBtn: cardEl.querySelector('.live-danmaku-control-bar .danmaku-voice-toggle-btn'),
      danmakuVoiceSelect: cardEl.querySelector('.live-danmaku-control-bar .danmaku-voice-select'),
      danmakuHistoryToggleBtn: cardEl.querySelector('.live-danmaku-control-bar .danmaku-history-toggle-btn'),
      danmakuNicknameInput: cardEl.querySelector('.danmaku-nickname-input'),
      danmakuInput: cardEl.querySelector('.danmaku-input'),
      danmakuSendBtn: cardEl.querySelector('.danmaku-send-btn'),
      danmakuShortcuts: cardEl.querySelector('.danmaku-shortcuts'),
      danmakuColors: cardEl.querySelectorAll('.danmaku-color-dot'),

      // 历史记录面板 DOM
      historyPanel: cardEl.querySelector('.danmaku-history-panel'),
      historyCloseBtn: cardEl.querySelector('.history-close-btn'),
      historyList: cardEl.querySelector('.history-list'),
      historyBody: cardEl.querySelector('.history-panel-body'),

      awayName: body.querySelector('.live-team-card.away .live-team-name'),
      awayScore: body.querySelector('.live-team-card.away .live-score-value'),
      awayFouls: body.querySelectorAll('.live-team-card.away .live-stat-box .value')[0],
      awayTimeouts: body.querySelectorAll('.live-team-card.away .live-stat-box .value')[1],

      homeName: body.querySelector('.live-team-card.home .live-team-name'),
      homeScore: body.querySelector('.live-team-card.home .live-score-value'),
      homeFouls: body.querySelectorAll('.live-team-card.home .live-stat-box .value')[0],
      homeTimeouts: body.querySelectorAll('.live-team-card.home .live-stat-box .value')[1],

      period: body.querySelector('.live-center-time .live-period'),
      clock: body.querySelector('.live-center-time .live-timer-clock'),
      clockState: body.querySelector('.live-center-time .live-timer-state')
    };

    // 初始化弹幕昵称
    const savedNickname = localStorage.getItem('live_danmaku_nickname') || '';
    if (elements.danmakuNicknameInput) {
      elements.danmakuNicknameInput.value = savedNickname;
      elements.danmakuNicknameInput.addEventListener('input', (e) => {
        localStorage.setItem('live_danmaku_nickname', e.target.value.trim());
      });
    }

    // 注册到本地管理字典中
    this.activeCards[matchId] = {
      dom: cardEl,
      timer: null,
      timeRemaining: initialData.timeRemaining || 600,
      isRunning: false,
      isPseudoFs: false, // 模拟全屏状态标记
      isMobileLandscapeFs: false, // 移动端伪横屏全屏标记
      
      // 视频相关配置
      hasVideo: false,
      videoStreamUrl: '',
      player: null,
      soundEnabled: false, // 默认静音播放

      // 弹幕相关状态与最后分配轨道时间戳（防重叠用）
      danmakuEnabled: true,
      danmakuVoiceEnabled: true,
      selectedColor: '#ffffff',
      lastChannelTimes: [], // 用于存储弹幕轨道上一次占用的截止时间

      // 上次更新的比分缓存，做跑马灯高光事件对比
      home: { score: initialData.home.score, fouls: initialData.home.fouls, timeouts: initialData.home.timeouts },
      away: { score: initialData.away.score, fouls: initialData.away.fouls, timeouts: initialData.away.timeouts },
      currentPeriod: initialData.currentPeriod || 1,
      elements
    };

    // 初始化语音音色
    const card = this.activeCards[matchId];
    const savedVoice = localStorage.getItem('live_danmaku_voice') || 'zh-CN-YunjianNeural';
    if (elements.danmakuVoiceSelect) {
      elements.danmakuVoiceSelect.value = savedVoice;
      elements.danmakuVoiceSelect.disabled = !card.danmakuVoiceEnabled;
      
      elements.danmakuVoiceSelect.addEventListener('change', (e) => {
        const newVoice = e.target.value;
        localStorage.setItem('live_danmaku_voice', newVoice);
        
        // 遍历所有正在直播的卡片，同步下拉框选中值
        Object.keys(this.activeCards).forEach(id => {
          const c = this.activeCards[id];
          if (c && c.elements && c.elements.danmakuVoiceSelect) {
            c.elements.danmakuVoiceSelect.value = newVoice;
          }
        });
        
        this.showTickerMessage(matchId, "🗣️ 已切换弹幕语音音色");
      });
    }

    // 绑定全屏切换按钮事件
    elements.fullscreenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFullscreen(matchId);
    });

    // 绑定声音切换按钮事件
    elements.volumeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMute(matchId);
    });

    // 监听全屏变动事件以支持 Esc / 原生方式退出时类名和状态还原
    const handleFsChange = () => {
      const isFs = document.fullscreenElement === cardEl || 
                   document.webkitFullscreenElement === cardEl;
      const icon = elements.fullscreenBtn.querySelector('i');
      if (isFs) {
        cardEl.classList.add('live-fullscreen-mode');
        if (icon) icon.className = 'bx bx-exit-fullscreen';
        // 原生全屏一旦生效，重置模拟全屏标记
        const c = this.activeCards[matchId];
        if (c) c.isPseudoFs = false;
      } else {
        const c = this.activeCards[matchId];
        // 只有当没有开启网页模拟全屏时，才因原生退出事件而清除类名
        if (c && !c.isPseudoFs) {
          cardEl.classList.remove('live-fullscreen-mode');
          if (icon) icon.className = 'bx bx-fullscreen';
        }
      }
      this.updateBodyFullscreenClass();
    };
    cardEl.addEventListener('fullscreenchange', handleFsChange);
    cardEl.addEventListener('webkitfullscreenchange', handleFsChange);

    // === 弹幕交互事件绑定 ===

    // 1. 弹幕显示/隐藏切换
    elements.danmakuToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      card.danmakuEnabled = !card.danmakuEnabled;
      if (card.danmakuEnabled) {
        elements.danmakuToggleBtn.classList.add('active');
        elements.danmakuContainer.style.display = 'block';
        this.showTickerMessage(matchId, "💬 弹幕功能已开启");
      } else {
        elements.danmakuToggleBtn.classList.remove('active');
        elements.danmakuContainer.style.display = 'none';
        // 清空当前正在飞的弹幕
        elements.danmakuContainer.innerHTML = '';
        this.showTickerMessage(matchId, "💬 弹幕功能已关闭");
      }
    });

    // 1.5 弹幕语音开关切换
    if (elements.danmakuVoiceToggleBtn) {
      elements.danmakuVoiceToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        card.danmakuVoiceEnabled = !card.danmakuVoiceEnabled;
        const icon = elements.danmakuVoiceToggleBtn.querySelector('i');
        if (card.danmakuVoiceEnabled) {
          elements.danmakuVoiceToggleBtn.classList.add('active');
          if (icon) icon.className = 'bx bx-volume-full';
          if (elements.danmakuVoiceSelect) elements.danmakuVoiceSelect.disabled = false;
          this.showTickerMessage(matchId, "🔊 弹幕语音已开启");
        } else {
          elements.danmakuVoiceToggleBtn.classList.remove('active');
          if (icon) icon.className = 'bx bx-volume-mute';
          if (elements.danmakuVoiceSelect) elements.danmakuVoiceSelect.disabled = true;
          this.showTickerMessage(matchId, "🔇 弹幕语音已关闭");
          // 关闭时过滤掉该场比赛积压的待播语音
          this.speechQueue = this.speechQueue.filter(item => item.matchId !== matchId);
          // 若当前正在读该场比赛的弹幕，则立即截断
          if (this.currentAudio && this.currentAudioMatchId === matchId) {
            console.log(`🔇 弹幕语音已关闭，立即中断当前比赛 [${matchId}] 的语音播报`);
            try {
              this.currentAudio.pause();
            } catch (err) {
              console.warn(err);
            }
            this.currentAudio = null;
            this.currentAudioMatchId = null;
            this.isSpeaking = false;
            this.isSpeakingProcessing = false;
            // 稍后继续播报其他场次的语音
            setTimeout(() => {
              this.processSpeechQueue();
            }, 100);
          }
        }
      });
    }

    // 1.6 弹幕历史面板开关
    if (elements.danmakuHistoryToggleBtn) {
      elements.danmakuHistoryToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cardEl.classList.toggle('has-history-open');
        if (cardEl.classList.contains('has-history-open')) {
          elements.danmakuHistoryToggleBtn.classList.add('active');
          if (elements.historyBody) {
            elements.historyBody.scrollTop = elements.historyBody.scrollHeight;
          }
        } else {
          elements.danmakuHistoryToggleBtn.classList.remove('active');
        }
      });
    }
    if (elements.historyCloseBtn) {
      elements.historyCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cardEl.classList.remove('has-history-open');
        if (elements.danmakuHistoryToggleBtn) {
          elements.danmakuHistoryToggleBtn.classList.remove('active');
        }
      });
    }

    // 2. 颜色选择
    elements.danmakuColors.forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.danmakuColors.forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        card.selectedColor = dot.dataset.color || '#ffffff';
      });
    });

    // 3. 快捷推荐词一键发送
    const shortcutContainer = elements.danmakuShortcuts;
    if (shortcutContainer) {
      shortcutContainer.querySelectorAll('.danmaku-shortcut-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const nickname = elements.danmakuNicknameInput ? elements.danmakuNicknameInput.value.trim() : '';
          if (!nickname) {
            alert("请先输入昵称再发送弹幕！");
            if (elements.danmakuNicknameInput) elements.danmakuNicknameInput.focus();
            return;
          }
          const text = item.textContent.trim();
          this.sendDanmakuMessage(matchId, text, card.selectedColor, nickname, false);
        });
      });
    }

    // 4. 输入框发送事件 (点击发送按钮 + 回车)
    const doSend = () => {
      const nickname = elements.danmakuNicknameInput ? elements.danmakuNicknameInput.value.trim() : '';
      if (!nickname) {
        alert("请先输入昵称再发送弹幕！");
        if (elements.danmakuNicknameInput) elements.danmakuNicknameInput.focus();
        return;
      }
      const text = elements.danmakuInput.value.trim();
      if (!text) return;
      if (text.length > 50) {
        alert('弹幕内容不能超过 50 个字哦');
        return;
      }
      this.sendDanmakuMessage(matchId, text, card.selectedColor, nickname, true);
      elements.danmakuInput.value = '';
    };

    elements.danmakuSendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      doSend();
    });

    elements.danmakuInput.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 防止全屏等快捷键冲突
      if (e.key === 'Enter') {
        doSend();
      }
    });

    // 5. 闲置隐藏控制栏逻辑 (Hide-on-idle)
    let idleTimer = null;
    const resetIdleTimer = () => {
      elements.danmakuBar.classList.remove('idle-hidden');
      if (idleTimer) clearTimeout(idleTimer);
      
      // 如果输入框没有聚焦，且当前是全屏模式，才进行 3 秒自动隐藏
      const isFs = document.fullscreenElement === cardEl || 
                   document.webkitFullscreenElement === cardEl ||
                   card.isPseudoFs ||
                   card.isMobileLandscapeFs;
      const isInputFocused = document.activeElement === elements.danmakuInput;

      if (isFs && !isInputFocused) {
        idleTimer = setTimeout(() => {
          elements.danmakuBar.classList.add('idle-hidden');
        }, 3000);
      }
    };
    card.resetIdleTimer = resetIdleTimer;

    // 全屏或鼠标在大屏面板内移动时重置闲置时钟
    cardEl.addEventListener('mousemove', resetIdleTimer);
    cardEl.addEventListener('click', resetIdleTimer);
    elements.danmakuInput.addEventListener('focus', () => {
      // 聚焦时取消隐藏，且不触发定时器
      elements.danmakuBar.classList.remove('idle-hidden');
      if (idleTimer) clearTimeout(idleTimer);
    });
    elements.danmakuInput.addEventListener('blur', resetIdleTimer);

    // 当全屏状态发生改变时，重置弹幕输入框内容并重置闲置隐藏计时器
    cardEl.addEventListener('fullscreenchange', () => {
      elements.danmakuInput.value = '';
      resetIdleTimer();
    });
    cardEl.addEventListener('webkitfullscreenchange', () => {
      elements.danmakuInput.value = '';
      resetIdleTimer();
    });

    // 插入到大屏视图容器中
    this.container.appendChild(cardEl);

    // 灌入初始状态
    this.updateCard(matchId, initialData, true);
  }

  // 更新现有比赛卡片数据
  updateCard(matchId, data, isFirst = false) {
    const card = this.activeCards[matchId];
    if (!card) return;

    // 1. 常规数据与队名比分渲染
    card.elements.awayName.textContent = data.away.name;
    card.elements.awayScore.textContent = data.away.score.toString().padStart(2, '0');
    card.elements.awayFouls.textContent = data.away.fouls;
    card.elements.awayTimeouts.textContent = data.away.timeouts;

    card.elements.homeName.textContent = data.home.name;
    card.elements.homeScore.textContent = data.home.score.toString().padStart(2, '0');
    card.elements.homeFouls.textContent = data.home.fouls;
    card.elements.homeTimeouts.textContent = data.home.timeouts;

    card.elements.period.textContent = `第 ${data.currentPeriod || 1} 节`;

    // 2. 轮次过滤展示（隐藏“淘汰赛”字样）
    const isElimination = data.roundName && (data.roundName === '淘汰赛' || data.roundName.includes('淘汰赛'));
    if (data.roundName && !isElimination) {
      card.elements.roundName.textContent = data.roundName;
      card.elements.roundName.style.display = 'inline-block';
    } else {
      card.elements.roundName.style.display = 'none';
    }

    // 3. 高光跑马灯提示（事件对比判定）
    if (!isFirst) {
      this.checkHighEvents(card, data);
    } else {
      this.showTickerMessage(matchId, "📡 实时同步成功 - 比赛直播中");
      // 首次同步时，渲染服务端传来的历史弹幕记录
      if (data.danmakuHistory && data.danmakuHistory.length > 0 && card.elements.historyList) {
        card.elements.historyList.innerHTML = ''; // 清空可能存在的旧记录
        data.danmakuHistory.forEach(payload => {
          this.renderDanmakuHistoryItem(matchId, payload);
        });
      }
    }

    // 4. 更新本地缓存的数据以便下次做高光对比
    card.home.score = data.home.score;
    card.home.fouls = data.home.fouls;
    card.home.timeouts = data.home.timeouts;
    card.away.score = data.away.score;
    card.away.fouls = data.away.fouls;
    card.away.timeouts = data.away.timeouts;
    card.currentPeriod = data.currentPeriod || 1;

    // 5. 现场视频直播流控制 (新增)
    const hasVideo = !!data.hasVideo;
    const videoStreamUrl = data.videoStreamUrl || '';

    if (hasVideo) {
      card.elements.videoWrapper.style.display = 'block';
      card.dom.classList.add('has-live');
      
      // 当播放器未初始化，或者拉流 URL 改变了，重新初始化播放器
      if (!card.player || card.videoStreamUrl !== videoStreamUrl) {
        this.initVideoPlayer(matchId, videoStreamUrl);
      }
    } else {
      card.elements.videoWrapper.style.display = 'none';
      card.dom.classList.remove('has-live');
      if (card.player) {
        console.log(`🔌 关闭比赛 [${matchId}] 的 WebRTC 直播拉流`);
        card.player.close();
        card.player = null;
      }
      card.elements.videoElement.src = '';
      card.elements.videoElement.srcObject = null;
    }

    card.hasVideo = hasVideo;
    card.videoStreamUrl = videoStreamUrl;

    // 6. 独立时钟步进校准
    this.syncClock(matchId, data.timeRemaining, data.isRunning);
  }

  // 分析该卡片前后的数据差，生成酷炫的高光广播
  // 分析该卡片前后的数据差，生成酷炫的高光广播
  checkHighEvents(card, curr) {
    const prev = card;
    let msg = "";
    let eventType = "";
    
    // 得分高光
    if (curr.home.score > prev.home.score) {
      const diff = curr.home.score - prev.home.score;
      msg = `🔥 ${curr.home.name} 投中精彩一球，+${diff}分！比分 ${curr.away.score} : ${curr.home.score}`;
      eventType = "home_score";
    } else if (curr.away.score > prev.away.score) {
      const diff = curr.away.score - prev.away.score;
      msg = `⚡ ${curr.away.name} 强攻得手，+${diff}分！比分 ${curr.away.score} : ${curr.home.score}`;
      eventType = "away_score";
    }
    
    // 犯规广播
    else if (curr.home.fouls > prev.home.fouls || curr.away.fouls > prev.away.fouls) {
      if (curr.home.fouls > prev.home.fouls) {
        msg = `⚠️ 裁判哨响！${curr.home.name} 被吹罚犯规！`;
      } else {
        msg = `⚠️ 裁判哨响！${curr.away.name} 被吹罚犯规！`;
      }
      eventType = "foul";
    }
    
    // 暂停广播
    else if (curr.home.timeouts > prev.home.timeouts || curr.away.timeouts > prev.away.timeouts) {
      if (curr.home.timeouts > prev.home.timeouts) {
        msg = `⏱️ 暂停！${curr.home.name} 请求战术调整。`;
      } else {
        msg = `⏱️ 暂停！${curr.away.name} 请求战术调整。`;
      }
      eventType = "timeout";
    }

    // 节数变更
    else if (curr.currentPeriod !== prev.currentPeriod) {
      msg = `🏁 哨声响起，比赛进入第 ${curr.currentPeriod} 节！`;
      eventType = "period";
    }

    if (msg) {
      this.showTickerMessage(curr.matchId, msg, true);
      if (eventType) {
        this.triggerEventDanmakus(curr.matchId, eventType);
      }
    }
  }

  // 触发跑马灯呼吸发光特效
  showTickerMessage(matchId, text, isFlash = false) {
    const card = this.activeCards[matchId];
    if (!card) return;

    card.elements.tickerMsg.textContent = text;
    if (isFlash && card.elements.tickerWrap) {
      card.elements.tickerWrap.classList.remove('ticker-flash');
      // 强迫 DOM 重绘，重复拉起 CSS 一闪而过的高光动画
      void card.elements.tickerWrap.offsetWidth;
      card.elements.tickerWrap.classList.add('ticker-flash');
    }
  }

  // 独立的秒表校准逻辑
  syncClock(matchId, serverTimeRemaining, serverIsRunning) {
    const card = this.activeCards[matchId];
    if (!card) return;

    card.timeRemaining = serverTimeRemaining;

    if (serverIsRunning) {
      card.elements.clockState.textContent = '进行中';
      card.elements.clockState.style.color = 'var(--success)';
      if (!card.isRunning) {
        this.startLocalClock(matchId);
      } else {
        // 本地时钟在跑，但同服务端时间差超过 1 秒，强行校对
        const localTime = card.timeRemaining;
        if (Math.abs(localTime - serverTimeRemaining) > 1) {
          card.timeRemaining = serverTimeRemaining;
          this.renderClock(matchId);
        }
      }
    } else {
      card.elements.clockState.textContent = '已暂停';
      card.elements.clockState.style.color = 'var(--text-secondary)';
      this.stopLocalClock(matchId);
      card.timeRemaining = serverTimeRemaining;
      this.renderClock(matchId);
    }
  }

  startLocalClock(matchId) {
    const card = this.activeCards[matchId];
    if (!card) return;

    this.stopLocalClock(matchId);
    card.isRunning = true;
    this.renderClock(matchId);

    card.timer = setInterval(() => {
      if (card.timeRemaining > 0) {
        card.timeRemaining--;
        this.renderClock(matchId);
      } else {
        this.stopLocalClock(matchId);
      }
    }, 1000);
  }

  stopLocalClock(matchId) {
    const card = this.activeCards[matchId];
    if (!card) return;

    card.isRunning = false;
    if (card.timer) {
      clearInterval(card.timer);
      card.timer = null;
    }
  }

  renderClock(matchId) {
    const card = this.activeCards[matchId];
    if (!card || !card.elements.clock) return;

    const m = Math.floor(card.timeRemaining / 60).toString().padStart(2, '0');
    const s = (card.timeRemaining % 60).toString().padStart(2, '0');
    card.elements.clock.textContent = `${m}:${s}`;
  }

  // 销毁单场比赛卡片
  destroyCard(matchId) {
    const card = this.activeCards[matchId];
    if (card) {
      this.stopLocalClock(matchId);
      if (card.player) {
        console.log(`🔌 销毁比赛卡片 [${matchId}]，关闭 WebRTC 播放器`);
        try {
          card.player.close();
        } catch (e) {
          console.error('关闭播放器失败:', e);
        }
        card.player = null;
      }
      if (card.dom) {
        card.dom.remove();
      }
      delete this.activeCards[matchId];
      this.updateBodyFullscreenClass();
    }
  }

  // 销毁所有比赛卡片
  destroyAllCards() {
    Object.keys(this.activeCards).forEach(matchId => {
      this.destroyCard(matchId);
    });
  }

  // 初始化 SRS SdpPlayer 播放器
  initVideoPlayer(matchId, videoStreamUrl) {
    const card = this.activeCards[matchId];
    if (!card) return;

    if (card.player) {
      try {
        card.player.close();
      } catch (e) {
        console.error('关闭原有播放器失败:', e);
      }
      card.player = null;
    }

    console.log(`🎬 准备拉取比赛 [${matchId}] 的 WebRTC 极速视频流: ${videoStreamUrl}`);
    
    // 显示状态遮罩
    card.elements.videoOverlay.classList.remove('hidden');
    card.elements.videoOverlay.querySelector('span').textContent = '正在连接极速视频信号...';

    // 实例化官方 SRS WebRTC SrsRtcPlayerAsync
    if (typeof SrsRtcPlayerAsync !== 'undefined') {
      try {
        const player = new SrsRtcPlayerAsync();
        card.player = player;

        // 绑定播放核心逻辑
        player.play(videoStreamUrl).then(() => {
          console.log(`✅ 比赛 [${matchId}] WebRTC 握手成功，开始播放`);
          card.elements.videoOverlay.classList.add('hidden');
          
          // 自动播放并根据用户声音设定设置静音状态
          card.elements.videoElement.muted = !card.soundEnabled;
          const volIcon = card.elements.volumeBtn.querySelector('i');
          if (volIcon) {
            volIcon.className = card.soundEnabled ? 'bx bx-volume-full' : 'bx bx-volume-mute';
          }
          card.elements.videoElement.srcObject = player.stream;
          card.elements.videoElement.play().catch(e => {
            console.warn('浏览器拦截了自动播放，需要用户交互唤醒:', e);
            // 改变状态遮罩，支持点击恢复播放
            card.elements.videoOverlay.classList.remove('hidden');
            card.elements.videoOverlay.querySelector('span').textContent = '点击画面开启直播信号';
            card.elements.videoOverlay.style.cursor = 'pointer';
            
            const clickToPlay = () => {
              card.elements.videoElement.play();
              card.elements.videoOverlay.classList.add('hidden');
              card.elements.videoOverlay.style.cursor = '';
              card.elements.videoOverlay.removeEventListener('click', clickToPlay);
            };
            card.elements.videoOverlay.addEventListener('click', clickToPlay);
          });
        }).catch(err => {
          console.error(`❌ 比赛 [${matchId}] WebRTC 播放信令握手失败:`, err);
          card.elements.videoOverlay.classList.remove('hidden');
          card.elements.videoOverlay.querySelector('span').textContent = '视频信号握手失败，请确认推流端是否已开播';
        });
      } catch (err) {
        console.error('初始化 SrsRtcPlayerAsync 发生错误:', err);
        card.elements.videoOverlay.classList.remove('hidden');
        let tip = '流媒体播放器初始化失败';
        if (err && (err.name === 'WebRTCNotSupported' || (err.message && err.message.indexOf('RTCPeerConnection') >= 0))) {
          tip = '非安全域名禁用了 WebRTC 极速拉流，请用 localhost 或 HTTPS 访问大屏';
        }
        card.elements.videoOverlay.querySelector('span').textContent = tip;
      }
    } else {
      console.error('SrsRtcPlayerAsync SDK 未定义，请检查 script 引入！');
      card.elements.videoOverlay.classList.remove('hidden');
      card.elements.videoOverlay.querySelector('span').textContent = '流媒体 SDK 缺失，无法拉流';
    }
  }

  // 切换声音播放与静音状态
  toggleMute(matchId) {
    const card = this.activeCards[matchId];
    if (!card || !card.elements.videoElement || !card.elements.volumeBtn) return;

    const video = card.elements.videoElement;
    const icon = card.elements.volumeBtn.querySelector('i');

    card.soundEnabled = !card.soundEnabled;
    video.muted = !card.soundEnabled;

    if (card.soundEnabled) {
      // 如果音量为0，解除静音时顺便开启默认音量
      if (video.volume === 0) {
        video.volume = 0.8;
      }
      if (icon) icon.className = 'bx bx-volume-full';
      this.showTickerMessage(matchId, "🔊 声音已开启");
    } else {
      if (icon) icon.className = 'bx bx-volume-mute';
      this.showTickerMessage(matchId, "🔇 声音已静音");
    }
  }

  // 网页全屏切换
  toggleFullscreen(matchId) {
    const card = this.activeCards[matchId];
    if (!card) return;

    const cardDom = card.dom;
    // 判断是否为移动端 (依据 UserAgent 或屏幕宽度)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 1024;

    if (isMobile) {
      // 移动端一律采用方案B：伪横屏全屏，既不受iOS原生视频播放器限制，也能自动横屏展示比分和弹幕
      const isMobileLandscapeFs = card.isMobileLandscapeFs;
      if (isMobileLandscapeFs) {
        this.setMobileLandscapeFullscreen(matchId, false);
      } else {
        this.setMobileLandscapeFullscreen(matchId, true);
      }
      return;
    }

    // 桌面端原有全屏逻辑保持不变
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    // 判断当前是否已经是某种全屏（原生或伪全屏）
    const isNativeFs = document.fullscreenElement === cardDom || 
                       document.webkitFullscreenElement === cardDom;
    const isPseudoFs = card.isPseudoFs;

    if (isNativeFs || isPseudoFs) {
      // 退出全屏
      if (isNativeFs) {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      } else {
        this.setPseudoFullscreen(matchId, false);
      }
    } else {
      // 开启全屏
      if (isIOS) {
        // iOS 设备直接使用网页模拟全屏，避免拉起系统视频播放器导致弹幕和记分栏丢失
        this.setPseudoFullscreen(matchId, true);
      } else {
        // 其它设备尝试原生全屏
        try {
          let promise = null;
          if (cardDom.requestFullscreen) {
            promise = cardDom.requestFullscreen();
          } else if (cardDom.webkitRequestFullscreen) {
            promise = cardDom.webkitRequestFullscreen();
          } else if (cardDom.msRequestFullscreen) {
            promise = cardDom.msRequestFullscreen();
          }
          
          if (promise && typeof promise.catch === 'function') {
            promise.catch(err => {
              console.warn("原生全屏请求被拒绝，降级为网页全屏:", err);
              this.setPseudoFullscreen(matchId, true);
            });
          } else if (!promise && !document.fullscreenElement && !document.webkitFullscreenElement) {
            // 如果调用后没有返回 promise 且状态没有立刻改变，延迟 150ms 兜底检测是否开启原生全屏
            setTimeout(() => {
              if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                console.warn("检测到原生全屏未生效，降级为网页全屏");
                this.setPseudoFullscreen(matchId, true);
              }
            }, 150);
          }
        } catch (e) {
          console.warn("调用原生全屏 API 失败，降级为网页全屏:", e);
          this.setPseudoFullscreen(matchId, true);
        }
      }
    }
  }

  // 移动端 3D 旋转伪横屏全屏设置
  setMobileLandscapeFullscreen(matchId, enable, updateHistory = true) {
    const card = this.activeCards[matchId];
    if (!card) return;

    const cardDom = card.dom;
    const icon = card.elements.fullscreenBtn.querySelector('i');

    if (enable) {
      card.isMobileLandscapeFs = true;
      
      // 尝试调用原生全屏隐藏移动端浏览器的导航栏和地址栏
      try {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen();
        }
      } catch (e) {
        console.warn("请求原生全屏隐藏导航栏失败:", e);
      }

      // 同时添加全屏样式与旋转类
      cardDom.classList.add('live-fullscreen-mode', 'live-mobile-landscape-fullscreen');
      if (icon) icon.className = 'bx bx-exit-fullscreen';
      this.showTickerMessage(matchId, "🖥️ 已进入横屏全屏模式");

      // 清空弹幕输入框内容
      if (card.elements && card.elements.danmakuInput) {
        card.elements.danmakuInput.value = '';
      }

      // 记录历史状态以便拦截物理返回键
      if (updateHistory) {
        window.history.pushState({ isMobileLandscapeFs: true, matchId: matchId }, '');
      }

      window.dispatchEvent(new Event('resize'));
    } else {
      card.isMobileLandscapeFs = false;
      
      // 尝试退出原生全屏恢复导航栏
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
          }
        }
      } catch (e) {
        console.warn("退出原生全屏失败:", e);
      }

      cardDom.classList.remove('live-fullscreen-mode', 'live-mobile-landscape-fullscreen');
      if (icon) icon.className = 'bx bx-fullscreen';
      this.showTickerMessage(matchId, "🖥️ 已退出全屏模式");

      if (card.elements && card.elements.danmakuInput) {
        card.elements.danmakuInput.value = '';
      }

      // 如果是手动点击退出全屏，且当前 history 确实是伪横屏状态，则退一步清除历史记录
      if (updateHistory && window.history.state && window.history.state.isMobileLandscapeFs) {
        window.history.back();
      }

      window.dispatchEvent(new Event('resize'));
    }

    if (typeof card.resetIdleTimer === 'function') {
      card.resetIdleTimer();
    }
    this.updateBodyFullscreenClass();
  }

  // 网页模拟全屏状态设置
  setPseudoFullscreen(matchId, enable, updateHistory = true) {
    const card = this.activeCards[matchId];
    if (!card) return;

    const cardDom = card.dom;
    const icon = card.elements.fullscreenBtn.querySelector('i');
    
    if (enable) {
      card.isPseudoFs = true;
      cardDom.classList.add('live-fullscreen-mode');
      if (icon) icon.className = 'bx bx-exit-fullscreen';
      this.showTickerMessage(matchId, "🖥️ 已进入网页全屏模式");
      
      // 清空弹幕输入框内容
      if (card.elements && card.elements.danmakuInput) {
        card.elements.danmakuInput.value = '';
      }
      
      // 记录历史状态以便拦截物理返回键
      if (updateHistory) {
        window.history.pushState({ isPseudoFs: true, matchId: matchId }, '');
      }

      window.dispatchEvent(new Event('resize'));
    } else {
      card.isPseudoFs = false;
      cardDom.classList.remove('live-fullscreen-mode');
      if (icon) icon.className = 'bx bx-fullscreen';
      this.showTickerMessage(matchId, "🖥️ 已退出全屏模式");
      
      if (card.elements && card.elements.danmakuInput) {
        card.elements.danmakuInput.value = '';
      }

      // 如果是手动点击退出全屏（而不是物理返回键触发），且当前 history 确实是全屏状态，则退一步清除历史记录
      if (updateHistory && window.history.state && window.history.state.isPseudoFs) {
        window.history.back();
      }

      window.dispatchEvent(new Event('resize'));
    }

    if (typeof card.resetIdleTimer === 'function') {
      card.resetIdleTimer();
    }
    this.updateBodyFullscreenClass();
  }

  // 发送弹幕消息到 WebSocket 服务端
  sendDanmakuMessage(matchId, text, color, nickname, isManual) {
    const card = this.activeCards[matchId];
    const voice = localStorage.getItem('live_danmaku_voice') || 'zh-CN-YunjianNeural';
    if (this.app && typeof this.app.sendWsMessage === 'function') {
      this.app.sendWsMessage('DANMAKU', {
        matchId,
        text,
        color,
        nickname,
        isManual,
        voice
      });
      // 无论服务器是否原样弹回，发送者本地直接进行语音播报，体验更即时
      if (isManual && nickname && card && card.danmakuVoiceEnabled) {
        this.speakDanmaku(matchId, nickname, text, voice);
      }
    } else {
      // 兜底本地渲染
      this.renderDanmakuHistoryItem(matchId, { matchId, text, color, nickname, isManual, voice, time: Date.now() });
      this.renderDanmaku(matchId, text, color);
      if (isManual && nickname && card && card.danmakuVoiceEnabled) {
        this.speakDanmaku(matchId, nickname, text, voice);
      }
    }
  }

  // 渲染单条历史弹幕记录到面板中
  renderDanmakuHistoryItem(matchId, payload) {
    const card = this.activeCards[matchId];
    if (!card || !card.elements.historyList) return;
    
    const li = document.createElement('li');
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'history-time';
    const date = payload.time ? new Date(payload.time) : new Date();
    timeSpan.textContent = `[${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}]`;
    
    const nickSpan = document.createElement('span');
    nickSpan.className = 'history-nickname';
    nickSpan.style.color = payload.color || '#ffffff';
    nickSpan.textContent = (payload.nickname || '匿名') + ':';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'history-text';
    textSpan.style.color = payload.color || '#ffffff';
    textSpan.textContent = payload.text;
    
    li.appendChild(timeSpan);
    li.appendChild(nickSpan);
    li.appendChild(textSpan);
    
    card.elements.historyList.appendChild(li);
    
    // 保持 DOM 里最多 200 条记录
    while (card.elements.historyList.children.length > 200) {
      card.elements.historyList.removeChild(card.elements.historyList.firstChild);
    }
    
    // 如果面板正打开着，自动滚动到底部
    if (card.dom.classList.contains('has-history-open')) {
      card.elements.historyBody.scrollTop = card.elements.historyBody.scrollHeight;
    }
  }

  // 接收到服务器广播的弹幕消息
  onDanmakuReceived(payload) {
    const { matchId, text, color, nickname, isManual, voice } = payload;
    const card = this.activeCards[matchId];
    if (!card) return;

    // 记录到历史面板
    this.renderDanmakuHistoryItem(matchId, payload);

    if (!card.danmakuEnabled) return;

    this.renderDanmaku(matchId, text, color);

    if (isManual && nickname && card.danmakuVoiceEnabled) {
      this.speakDanmaku(matchId, nickname, text, voice);
    }
  }

  // 使用系统语音朗读高能弹幕（已改为服务端 TTS 高音质男声与队列顺序播报）
  speakDanmaku(matchId, nickname, text, voice) {
    const voiceKey = `${nickname}-${text}`;
    if (this.lastSpoken === voiceKey) return; // 防重复播报
    this.lastSpoken = voiceKey;
    setTimeout(() => { if (this.lastSpoken === voiceKey) this.lastSpoken = null; }, 5000);

    // 限制队列最大长度为 30，过多的弹幕直接丢弃，防止高并发卡顿及声音无限堆积
    if (this.speechQueue.length >= 30) {
      console.log('🔊 TTS 语音队列已满，丢弃该条语音：', text);
      return;
    }

    this.speechQueue.push({ matchId, nickname, text, voice });

    // 若当前未在播放，启动播放队列
    if (!this.isSpeaking) {
      this.processSpeechQueue();
    }
  }

  // 顺序播放语音队列中的音频
  processSpeechQueue() {
    // 增加并发进入的保护锁
    if (this.isSpeakingProcessing) return;
    this.isSpeakingProcessing = true;

    try {
      if (this.speechQueue.length === 0) {
        this.isSpeaking = false;
        this.isSpeakingProcessing = false;
        return;
      }

      this.isSpeaking = true;
      const { matchId, nickname, text, voice } = this.speechQueue.shift();

      // 限制单句播报长度，截取前 40 个字
      const formatText = `${nickname}说：${text}`.substring(0, 40);
      const activeVoice = voice || 'zh-CN-YunjianNeural';
      const audioUrl = `/api/tts?text=${encodeURIComponent(formatText)}&voice=${activeVoice}`;

      const audio = new Audio(audioUrl);
      this.currentAudio = audio;
      this.currentAudioMatchId = matchId;

      let hasCleanedUp = false;
      const cleanupAndNext = () => {
        if (hasCleanedUp) return;
        hasCleanedUp = true;

        audio.onended = null;
        audio.onerror = null;

        if (this.currentAudio === audio) {
          this.currentAudio = null;
          this.currentAudioMatchId = null;
        }

        this.isSpeaking = false;
        this.isSpeakingProcessing = false;

        // 稍微延迟 100 毫秒后播下一条，给用户体验更好的留白
        setTimeout(() => {
          this.processSpeechQueue();
        }, 100);
      };

      audio.onended = cleanupAndNext;
      
      audio.onerror = (err) => {
        console.warn('🔊 TTS 播放失败，自动跳过此条', err);
        cleanupAndNext();
      };

      audio.play().catch(err => {
        console.warn('🔊 播放音频被浏览器策略拦截或出错，跳过该条', err);
        cleanupAndNext();
      });
    } catch (err) {
      console.error('🔊 处理语音队列发生异常:', err);
      this.isSpeaking = false;
      this.isSpeakingProcessing = false;
    }
  }

  // 渲染并射出一条弹幕
  renderDanmaku(matchId, text, color) {
    const card = this.activeCards[matchId];
    if (!card || !card.elements.danmakuContainer) return;

    // 如果弹幕已被关闭，直接返回
    if (!card.danmakuEnabled) return;

    // 创建弹幕节点
    const danmakuEl = document.createElement('div');
    danmakuEl.className = 'danmaku-item';
    danmakuEl.textContent = text;
    danmakuEl.style.color = color || '#ffffff';

    // 动态计算弹幕起始横向偏移（适配伪横屏旋转）
    const containerWidth = card.elements.danmakuContainer.offsetWidth || 
      (card.isMobileLandscapeFs ? window.innerHeight : window.innerWidth);
    danmakuEl.style.setProperty('--danmaku-start', `${containerWidth}px`);

    // 弹幕轨道算法
    const isMobileLandscape = !!card.isMobileLandscapeFs;
    const channelHeight = isMobileLandscape ? 26 : 38; // 每条轨道的纵向高度像素
    const maxChannels = isMobileLandscape ? 6 : 8;    // 最多轨道数
    const now = Date.now();

    // 初始化轨道时间戳数组
    if (!card.lastChannelTimes) {
      card.lastChannelTimes = new Array(maxChannels).fill(0);
    } else if (card.lastChannelTimes.length !== maxChannels) {
      // 当切换模式后，重置轨道时间戳数组长度
      card.lastChannelTimes = new Array(maxChannels).fill(0);
    }

    // 寻找当前空闲（释放时间已过）的轨道
    let availableChannels = [];
    for (let i = 0; i < maxChannels; i++) {
      if (now > card.lastChannelTimes[i]) {
        availableChannels.push(i);
      }
    }

    let selectedChannel = 0;
    if (availableChannels.length > 0) {
      // 随机从可用的轨道里选一条
      selectedChannel = availableChannels[Math.floor(Math.random() * availableChannels.length)];
    } else {
      // 如果都忙，挑选一个最先释放的轨道
      let minTime = card.lastChannelTimes[0];
      let minIndex = 0;
      for (let i = 1; i < maxChannels; i++) {
        if (card.lastChannelTimes[i] < minTime) {
          minTime = card.lastChannelTimes[i];
          minIndex = i;
        }
      }
      selectedChannel = minIndex;
    }

    // 更新该轨道的占用时间（防重叠防追尾，防抖2.5秒）
    card.lastChannelTimes[selectedChannel] = now + 2500;

    // 设置弹幕样式与位置
    const topPos = (isMobileLandscape ? 10 : 20) + selectedChannel * channelHeight;
    danmakuEl.style.top = `${topPos}px`;

    // 插入容器
    card.elements.danmakuContainer.appendChild(danmakuEl);

    // 动画结束自动销毁
    danmakuEl.addEventListener('animationend', () => {
      danmakuEl.remove();
    });
  }

  // 触发气氛组弹幕
  triggerEventDanmakus(matchId, eventType) {
    const card = this.activeCards[matchId];
    if (!card || !card.danmakuEnabled) return;

    const danmakuPools = {
      home_score: [
        "🔥 漂亮！！", "主队威武！", "这球太硬了！", "神射手啊！", 
        "主队加油！冲！", "这配合绝了！", "帅呆了这球！", "防不住啊",
        "打三分！", "直接一波流带走！"
      ],
      away_score: [
        "⚡ 好球好球！", "客队强啊！", "咬住比分了！", "这球投得真果断！", 
        "三分刷网！舒服！", "客队加油！", "追分时刻到了！", "硬气！",
        "好球！", "这球厉害了！"
      ],
      foul: [
        "⚠️ 吹哨了吹哨了", "这个动作有点大", "防守要注意啊", 
        "犯规了，送对方上罚球线？", "强度拉起来了！", "防守动作收一下"
      ],
      timeout: [
        "⏱️ 开始画战术板了", "这暂停叫得很及时", "歇一口气，下回合继续", 
        "两边打得火药味十足", "重新布置下防守吧", "主力可以缓一缓了"
      ],
      period: [
        "🏁 这节太精彩了！", "拼体力的时候到了", "下半场继续战斗", 
        "两边打得有来有回", "精彩的对决！"
      ]
    };

    const pool = danmakuPools[eventType];
    if (!pool) return;

    // 随机选择 2 到 4 条弹幕
    const count = Math.floor(Math.random() * 3) + 2; // 2, 3, 4 条
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    // 随机颜色
    const colors = ["#ffffff", "#ff4d4f", "#ffeb3b", "#4caf50", "#2196f3"];

    selected.forEach((text, index) => {
      // 增加随机延迟，让弹幕流显得更自然
      const delay = index * 400 + Math.random() * 500; // 错开 400ms-900ms 左右
      setTimeout(() => {
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        this.renderDanmaku(matchId, text, randomColor);
      }, delay);
    });
  }

  // 动态更新 body 的全屏样式类
  updateBodyFullscreenClass() {
    const hasFs = document.querySelector('.live-fullscreen-mode') !== null;
    if (hasFs) {
      document.body.classList.add('has-fullscreen-panel');
    } else {
      document.body.classList.remove('has-fullscreen-panel');
    }
  }
}
