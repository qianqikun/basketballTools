export class LiveModule {
  constructor(app) {
    this.app = app;
    // 维护当前所有的活动比赛卡片
    // 键是 matchId，值是包含 DOM 引用和该场时钟状态的对象
    this.activeCards = {};

    // 基础 DOM 容器
    this.emptyState = document.getElementById('live-empty-state');
    this.container = document.getElementById('live-active-matches');
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
          <!-- 视频拉流状态占位 -->
          <div class="video-overlay">
            <i class='bx bx-loader-alt bx-spin'></i>
            <span>正在连接极速视频信号...</span>
          </div>
          <!-- 真正的 HTML5 Video 播放器 -->
          <video muted playsinline webkit-playsinline></video>
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

    // 注册到本地管理字典中
    this.activeCards[matchId] = {
      dom: cardEl,
      timer: null,
      timeRemaining: initialData.timeRemaining || 600,
      isRunning: false,
      
      // 视频相关配置
      hasVideo: false,
      videoStreamUrl: '',
      player: null,

      // 上次更新的比分缓存，做跑马灯高光事件对比
      home: { score: initialData.home.score, fouls: initialData.home.fouls, timeouts: initialData.home.timeouts },
      away: { score: initialData.away.score, fouls: initialData.away.fouls, timeouts: initialData.away.timeouts },
      currentPeriod: initialData.currentPeriod || 1,
      elements
    };

    // 绑定全屏切换按钮事件
    elements.fullscreenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFullscreen(matchId);
    });

    // 监听全屏变动事件以支持 Esc / 原生方式退出时类名和状态还原
    const handleFsChange = () => {
      const isFs = document.fullscreenElement === cardEl || 
                   document.webkitFullscreenElement === cardEl;
      const icon = elements.fullscreenBtn.querySelector('i');
      if (isFs) {
        cardEl.classList.add('live-fullscreen-mode');
        if (icon) icon.className = 'bx bx-exit-fullscreen';
      } else {
        cardEl.classList.remove('live-fullscreen-mode');
        if (icon) icon.className = 'bx bx-fullscreen';
      }
    };
    cardEl.addEventListener('fullscreenchange', handleFsChange);
    cardEl.addEventListener('webkitfullscreenchange', handleFsChange);

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
  checkHighEvents(card, curr) {
    const prev = card;
    let msg = "";
    
    // 得分高光
    if (curr.home.score > prev.home.score) {
      const diff = curr.home.score - prev.home.score;
      msg = `🔥 ${curr.home.name} 投中精彩一球，+${diff}分！比分 ${curr.away.score} : ${curr.home.score}`;
    } else if (curr.away.score > prev.away.score) {
      const diff = curr.away.score - prev.away.score;
      msg = `⚡ ${curr.away.name} 强攻得手，+${diff}分！比分 ${curr.away.score} : ${curr.home.score}`;
    }
    
    // 犯规广播
    else if (curr.home.fouls > prev.home.fouls) {
      msg = `⚠️ 裁判哨响！${curr.home.name} 被吹罚犯规！`;
    } else if (curr.away.fouls > prev.away.fouls) {
      msg = `⚠️ 裁判哨响！${curr.away.name} 被吹罚犯规！`;
    }
    
    // 暂停广播
    else if (curr.home.timeouts > prev.home.timeouts) {
      msg = `⏱️ 暂停！${curr.home.name} 请求战术调整。`;
    } else if (curr.away.timeouts > prev.away.timeouts) {
      msg = `⏱️ 暂停！${curr.away.name} 请求战术调整。`;
    }

    // 节数变更
    else if (curr.currentPeriod !== prev.currentPeriod) {
      msg = `🏁 哨声响起，比赛进入第 ${curr.currentPeriod} 节！`;
    }

    if (msg) {
      this.showTickerMessage(curr.matchId, msg, true);
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
          
          // 自动播放并静音
          card.elements.videoElement.muted = true;
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

  // 网页全屏切换
  toggleFullscreen(matchId) {
    const card = this.activeCards[matchId];
    if (!card) return;

    const cardDom = card.dom;
    const isFullscreen = document.fullscreenElement === cardDom || 
                         document.webkitFullscreenElement === cardDom;

    if (!isFullscreen) {
      // 开启全屏
      if (cardDom.requestFullscreen) {
        cardDom.requestFullscreen();
      } else if (cardDom.webkitRequestFullscreen) {
        cardDom.webkitRequestFullscreen();
      } else if (cardDom.msRequestFullscreen) {
        cardDom.msRequestFullscreen();
      }
    } else {
      // 退出全屏
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }
}
