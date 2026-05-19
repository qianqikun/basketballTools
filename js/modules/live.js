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
        <div class="live-center-time">
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
    `;

    // 缓存卡片内部的 DOM 节点引用，避免后续查找性能损耗
    const body = cardEl.querySelector('.live-scoreboard-body');
    const elements = {
      tickerWrap: cardEl.querySelector('.live-ticker-wrap'),
      tickerMsg: cardEl.querySelector('.live-ticker-message'),
      roundName: cardEl.querySelector('.live-round-tag'),
      
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
      
      // 上次更新的比分缓存，做跑马灯高光事件对比
      home: { score: initialData.home.score, fouls: initialData.home.fouls, timeouts: initialData.home.timeouts },
      away: { score: initialData.away.score, fouls: initialData.away.fouls, timeouts: initialData.away.timeouts },
      currentPeriod: initialData.currentPeriod || 1,
      elements
    };

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

    // 5. 独立时钟步进校准
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
}
