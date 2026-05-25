export class MatchModule {
  constructor(app) {
    this.app = app;
    this.currentMatch = null;
    this.timer = null;
    this.timeRemaining = 10 * 60; // 默认 10 分钟
    this.isRunning = false;

    // DOM 元素
    this.roundName = document.getElementById('match-round-name');
    this.backBtn = document.getElementById('back-to-tournament');
    this.finishBtn = document.getElementById('finish-match-btn');
    
    // 主客队数据
    this.teams = {
      home: { id: '', score: 0, fouls: 0, timeouts: 0, el: { name: document.getElementById('home-name'), score: document.getElementById('home-score'), fouls: document.getElementById('home-fouls'), timeouts: document.getElementById('home-timeouts') } },
      away: { id: '', score: 0, fouls: 0, timeouts: 0, el: { name: document.getElementById('away-name'), score: document.getElementById('away-score'), fouls: document.getElementById('away-fouls'), timeouts: document.getElementById('away-timeouts') } }
    };

    // 时钟
    this.clockEl = document.getElementById('main-clock');
    this.startStopBtn = document.getElementById('start-stop-btn');
    this.resetClockBtn = document.getElementById('reset-clock-btn');

    // 视频直播后台控制 DOM
    this.liveToggleBtn = document.getElementById('live-settings-toggle-btn');
    this.liveSettingsContent = document.getElementById('live-settings-content');
    this.liveVideoEnable = document.getElementById('live-video-enable');
    this.liveUrlInputGroup = document.getElementById('live-url-input-group');
    this.liveVideoUrl = document.getElementById('live-video-url');
    this.liveStreamGuide = document.getElementById('live-stream-guide');
    this.livePushUrlDisplay = document.getElementById('live-push-url-display');
    this.copyPushUrlBtn = document.getElementById('copy-push-url-btn');
    this.livePushQr = document.getElementById('live-push-qr');
    this.qrInstance = null;
    
    // 遮罩层 DOM
    this.overlay = document.getElementById('match-control-overlay');
    this.overlayIcon = document.getElementById('match-overlay-icon');
    this.overlayText = document.getElementById('match-overlay-text');
    this.overlaySubtext = document.getElementById('match-overlay-subtext');
    this.overlayBackBtn = document.getElementById('match-overlay-back-btn');
    this.scoreboardContainer = document.getElementById('match-scoreboard-container');
    
    this.bindEvents();
  }

  bindEvents() {
    this.backBtn.addEventListener('click', async () => {
      this.stopClock();
      this.currentMatch = null; // 离开时清空状态
      this.app.switchView('tournament');
    });

    if (this.overlayBackBtn) {
      this.overlayBackBtn.addEventListener('click', () => {
        this.stopClock();
        this.currentMatch = null;
        this.app.switchView('tournament');
      });
    }

    // 绑定加减分
    document.querySelectorAll('.score-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const team = e.target.dataset.team;
        const points = parseInt(e.target.dataset.points);
        this.updateScore(team, points);
      });
    });

    // 绑定犯规和暂停
    ['home', 'away'].forEach(team => {
      document.getElementById(`${team}-foul-plus`).addEventListener('click', () => this.updateStat(team, 'fouls', 1));
      document.getElementById(`${team}-foul-minus`).addEventListener('click', () => this.updateStat(team, 'fouls', -1));
      document.getElementById(`${team}-timeout-plus`).addEventListener('click', () => this.updateStat(team, 'timeouts', 1));
      document.getElementById(`${team}-timeout-minus`).addEventListener('click', () => this.updateStat(team, 'timeouts', -1));
    });

    // 计时器
    this.startStopBtn.addEventListener('click', () => this.toggleClock());
    this.resetClockBtn.addEventListener('click', () => {
      if(confirm('确定重置时间到10分钟吗？')) {
        this.resetClock();
      }
    });

    // 结束比赛
    this.finishBtn.addEventListener('click', () => this.finishMatch());

    // 折叠设置面板事件
    if (this.liveToggleBtn) {
      this.liveToggleBtn.addEventListener('click', () => {
        this.liveToggleBtn.classList.toggle('active');
        this.liveSettingsContent.classList.toggle('show');
      });
    }

    // 启用视频直播开关切换事件
    if (this.liveVideoEnable) {
      this.liveVideoEnable.addEventListener('change', () => {
        this.handleLiveToggle();
      });
    }

    // 自定义拉流链接输入事件
    if (this.liveVideoUrl) {
      this.liveVideoUrl.addEventListener('input', () => {
        // 保存全局自定义 URL
        localStorage.setItem('hoops_manager_global_live_url', this.liveVideoUrl.value.trim());
        this.saveLiveState();
        this.syncToWs();
      });
    }

    // 复制推流链接
    if (this.copyPushUrlBtn) {
      this.copyPushUrlBtn.addEventListener('click', () => {
        const pushUrl = this.livePushUrlDisplay.value;
        if (pushUrl) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(pushUrl).then(() => {
              alert('推流地址已复制到剪贴板，请在推流软件中粘贴使用！');
            }).catch(err => {
              this.fallbackCopyInput(this.livePushUrlDisplay);
            });
          } else {
            this.fallbackCopyInput(this.livePushUrlDisplay);
          }
        }
      });
    }
  }

  // 非安全上下文（非localhost的HTTP环境）下的命令式兼容复制方法
  fallbackCopyInput(inputEl) {
    if (!inputEl) return;
    inputEl.select();
    inputEl.setSelectionRange(0, 99999); // 兼容移动端
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        alert('推流地址已复制到剪贴板，请在推流软件中粘贴使用！');
      } else {
        alert('自动复制失败，请手动选择并复制推流框中的地址！');
      }
    } catch (err) {
      alert('自动复制失败，请手动选择并复制推流框中的地址！');
    }
  }

  handleLiveToggle() {
    const enabled = this.liveVideoEnable.checked;
    if (enabled) {
      this.liveUrlInputGroup.style.display = 'block';
      this.liveStreamGuide.style.display = 'flex';
      this.updatePushGuide();
    } else {
      this.liveUrlInputGroup.style.display = 'none';
      this.liveStreamGuide.style.display = 'none';
    }
    // 保存全局持久化设置
    localStorage.setItem('hoops_manager_global_live_enabled', enabled ? 'true' : 'false');
    this.saveLiveState();
    this.syncToWs();
  }

  updatePushGuide() {
    if (!this.currentMatch) return;
    const hostname = window.location.hostname;
    
    // 生成推流地址
    const pushUrl = `rtmp://${hostname}:1935/live/show_${this.currentMatch.id}`;
    this.livePushUrlDisplay.value = pushUrl;

    // 渲染 iOS/Larix 扫码二维码：使用 larix://[rtmp-url] 协议快捷拉起配置
    const larixUrl = pushUrl.replace('rtmp://', 'larix://');

    this.livePushQr.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      try {
        new QRCode(this.livePushQr, {
          text: larixUrl,
          width: 120,
          height: 120,
          colorDark: '#0f172a',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (err) {
        console.error('生成推流二维码失败:', err);
      }
    }
  }

  // 辅助方法：向 WebSocket 发送初始开赛消息，拉起所有观众端大屏
  sendStartSignal() {
    if (!this.currentMatch) return;
    const periodEl = document.getElementById('current-period');
    const period = periodEl ? parseInt(periodEl.textContent) : 1;
    
    const hasVideo = this.liveVideoEnable ? this.liveVideoEnable.checked : false;
    let videoStreamUrl = this.liveVideoUrl ? this.liveVideoUrl.value.trim() : '';
    if (hasVideo && !videoStreamUrl) {
      videoStreamUrl = `webrtc://${window.location.hostname}/live/show_${this.currentMatch.id}`;
    }

    const referee = this.app.currentUser ? {
      username: this.app.currentUser.username,
      nickname: this.app.currentUser.nickname
    } : null;

    this.app.sendWsMessage('MATCH_START', {
      matchId: this.currentMatch.id,
      roundName: this.currentMatch.roundName || '',
      home: { name: this.teams.home.el.name.textContent, score: this.teams.home.score, fouls: this.teams.home.fouls, timeouts: this.teams.home.timeouts },
      away: { name: this.teams.away.el.name.textContent, score: this.teams.away.score, fouls: this.teams.away.fouls, timeouts: this.teams.away.timeouts },
      timeRemaining: this.timeRemaining,
      currentPeriod: period,
      hasVideo,
      videoStreamUrl,
      referee
    });
  }

  // 辅助方法：在关键操作或秒表运行中，将当前状态实时推送到 WS 服务器
  syncToWs() {
    if (!this.currentMatch) return;
    const periodEl = document.getElementById('current-period');
    const period = periodEl ? parseInt(periodEl.textContent) : 1;

    const hasVideo = this.liveVideoEnable ? this.liveVideoEnable.checked : false;
    let videoStreamUrl = this.liveVideoUrl ? this.liveVideoUrl.value.trim() : '';
    if (hasVideo && !videoStreamUrl) {
      videoStreamUrl = `webrtc://${window.location.hostname}/live/show_${this.currentMatch.id}`;
    }

    const referee = this.app.currentUser ? {
      username: this.app.currentUser.username,
      nickname: this.app.currentUser.nickname
    } : null;

    this.app.sendWsMessage('MATCH_UPDATE', {
      matchId: this.currentMatch.id,
      home: { name: this.teams.home.el.name.textContent, score: this.teams.home.score, fouls: this.teams.home.fouls, timeouts: this.teams.home.timeouts },
      away: { name: this.teams.away.el.name.textContent, score: this.teams.away.score, fouls: this.teams.away.fouls, timeouts: this.teams.away.timeouts },
      timeRemaining: this.timeRemaining,
      currentPeriod: period,
      isRunning: this.isRunning,
      hasVideo,
      videoStreamUrl,
      referee
    });
  }

  loadMatch(match, isRestore = false) {
    this.currentMatch = match;
    this.showOverlay('loading', '正在获取控制权...', '请稍候，系统正在向服务器申请比赛控制锁。');
    
    const refereeText = this.app.currentUser ? ` (执裁裁判: ${this.app.currentUser.nickname})` : '';
    this.roundName.textContent = `当前对阵${refereeText}`;
    
    // 初始化队伍信息
    this.teams.home.id = match.team1.id;
    this.teams.home.el.name.textContent = match.team1.name;
    this.teams.away.id = match.team2.id;
    this.teams.away.el.name.textContent = match.team2.name;

    if (isRestore) {
      const saved = localStorage.getItem('hoops_manager_live_match');
      if (saved) {
        try {
          const liveData = JSON.parse(saved);
          // 只有当 matchId 匹配时才允许恢复现场数据，防止串场
          if (liveData.matchId === match.id) {
            this.teams.home.score = liveData.home.score;
            this.teams.home.fouls = liveData.home.fouls;
            this.teams.home.timeouts = liveData.home.timeouts;
            
            this.teams.away.score = liveData.away.score;
            this.teams.away.fouls = liveData.away.fouls;
            this.teams.away.timeouts = liveData.away.timeouts;
            
            this.timeRemaining = liveData.timeRemaining;

            // 还原直播配置
            if (this.liveVideoEnable) {
              this.liveVideoEnable.checked = liveData.hasVideo || false;
              this.liveVideoUrl.value = liveData.videoStreamUrl || '';
              this.handleLiveToggle();
            }

            this.renderClock();
            this.updateUI();
            
            // 发起控制权请求，成功后自动推流
            this.requestControl(match.id, false);
            return;
          }
        } catch (e) {
          console.error("恢复比赛数据失败，将重新初始化:", e);
        }
      }
    }

    // 默认全新进入比赛
    this.teams.home.score = match.score1 || 0;
    this.teams.home.fouls = 0;
    this.teams.home.timeouts = 0;

    this.teams.away.score = match.score2 || 0;
    this.teams.away.fouls = 0;
    this.teams.away.timeouts = 0;

    // 自动加载保留的全局直播配置
    if (this.liveVideoEnable) {
      const globalLiveEnabled = localStorage.getItem('hoops_manager_global_live_enabled') === 'true';
      const globalLiveUrl = localStorage.getItem('hoops_manager_global_live_url') || '';
      
      this.liveVideoEnable.checked = globalLiveEnabled;
      this.liveVideoUrl.value = globalLiveUrl;
      
      // 如果曾经开启过，自动展开折叠栏（如果相关 DOM 存在的话）
      if (globalLiveEnabled && this.liveToggleBtn && this.liveSettingsContent) {
        this.liveToggleBtn.classList.add('active');
        this.liveSettingsContent.classList.add('show');
      } else {
        if (this.liveToggleBtn) this.liveToggleBtn.classList.remove('active');
        if (this.liveSettingsContent) this.liveSettingsContent.classList.remove('show');
      }
      this.handleLiveToggle();
    }

    this.resetClock();
    this.updateUI();
    this.saveLiveState();
    
    // 发起控制权请求，成功后自动推流
    this.requestControl(match.id, false);
  }

  saveLiveState() {
    if (!this.currentMatch) return;
    const hasVideo = this.liveVideoEnable ? this.liveVideoEnable.checked : false;
    const videoStreamUrl = this.liveVideoUrl ? this.liveVideoUrl.value.trim() : '';
    const liveData = {
      matchId: this.currentMatch.id,
      home: {
        score: this.teams.home.score,
        fouls: this.teams.home.fouls,
        timeouts: this.teams.home.timeouts
      },
      away: {
        score: this.teams.away.score,
        fouls: this.teams.away.fouls,
        timeouts: this.teams.away.timeouts
      },
      timeRemaining: this.timeRemaining,
      hasVideo,
      videoStreamUrl
    };
    localStorage.setItem('hoops_manager_live_match', JSON.stringify(liveData));
  }

  updateScore(team, points) {
    this.teams[team].score += points;
    if (this.teams[team].score < 0) this.teams[team].score = 0;
    this.updateUI();
    this.saveLiveState();
    this.syncToWs(); // 发生比分变动，立刻同步
  }

  updateStat(team, stat, value) {
    this.teams[team][stat] += value;
    if (this.teams[team][stat] < 0) this.teams[team][stat] = 0;
    this.updateUI();
    this.saveLiveState();
    this.syncToWs(); // 发生犯规/暂停变动，立刻同步
  }

  updateUI() {
    ['home', 'away'].forEach(team => {
      const t = this.teams[team];
      t.el.score.textContent = t.score.toString().padStart(2, '0');
      t.el.fouls.textContent = t.fouls;
      t.el.timeouts.textContent = t.timeouts;
    });
  }

  /* 计时器逻辑 */
  toggleClock() {
    if (this.isRunning) {
      this.stopClock();
    } else {
      this.startClock();
    }
  }

  startClock() {
    this.isRunning = true;
    this.startStopBtn.innerHTML = "<i class='bx bx-pause'></i> 暂停";
    this.startStopBtn.style.backgroundColor = 'var(--danger)';
    
    // 启动秒表立刻同步一次
    this.syncToWs();

    let syncCounter = 0;
    this.timer = setInterval(() => {
      if (this.timeRemaining > 0) {
        this.timeRemaining--;
        this.renderClock();
        
        // 运行中每 2 秒对齐一次 WS，减轻服务器压力又保持高度精确
        syncCounter++;
        if (syncCounter >= 2) {
          this.syncToWs();
          syncCounter = 0;
        }
      } else {
        this.stopClock();
        alert('时间到！');
      }
    }, 1000);
  }

  stopClock() {
    this.isRunning = false;
    clearInterval(this.timer);
    this.startStopBtn.innerHTML = "<i class='bx bx-play'></i> 开始";
    this.startStopBtn.style.backgroundColor = '';
    
    // 暂停秒表立刻同步一次
    this.syncToWs();
  }

  resetClock() {
    this.stopClock();
    this.timeRemaining = 10 * 60;
    this.renderClock();
    this.syncToWs(); // 重置秒表立刻同步一次
  }

  renderClock() {
    const m = Math.floor(this.timeRemaining / 60).toString().padStart(2, '0');
    const s = (this.timeRemaining % 60).toString().padStart(2, '0');
    this.clockEl.textContent = `${m}:${s}`;
    this.saveLiveState();
  }

  finishMatch() {
    if (this.teams.home.score === this.teams.away.score) {
      alert('比分相同，无法决出胜负，请先通过加时赛决定胜者！');
      return;
    }

    if (confirm('确定要结束本场比赛并提交比分吗？提交后无法修改。')) {
      this.stopClock();
      
      const t = this.app.store.tournament;
      const matchIndex = t.currentMatches.findIndex(m => m.id === this.currentMatch.id);
      
      if (matchIndex !== -1) {
        const match = t.currentMatches[matchIndex];
        match.score1 = this.teams.home.score;
        match.score2 = this.teams.away.score;
        match.completed = true;
        
        // 判定胜负
        if (match.score1 > match.score2) {
          match.winner = match.team1;
          // 从 activeTeams 中剔除失败者
          t.activeTeams = t.activeTeams.filter(team => team.id !== match.team2.id);
        } else {
          match.winner = match.team2;
          t.activeTeams = t.activeTeams.filter(team => team.id !== match.team1.id);
        }

        // 清理 live state
        localStorage.removeItem('hoops_manager_live_match');
        localStorage.removeItem('hoops_manager_active_match_id');

        // 保存更新后的锦标赛状态
        this.app.saveStore('tournament', t);
        
        // 检查是否所有比赛都打完了，如果打完了要归档到 history
        const allCompleted = t.currentMatches.every(m => m.completed);
        if (allCompleted) {
          // 归档当前轮次
          t.history.push({
            round: t.round,
            matches: JSON.parse(JSON.stringify(t.currentMatches))
          });
          // 准备下一轮
          t.round += 1;
          t.currentMatches = []; // 清空当前对阵，等待再次抽签
          this.app.saveStore('tournament', t);
        }

        // 比赛正式结束，向 WS 服务器发送广播清除实时看板
        this.app.sendWsMessage('MATCH_END', { matchId: this.currentMatch.id });

        alert(`比赛结束！胜者是：${match.winner.name}`);
        this.app.switchView('tournament');
      }
    }
  }

  // WebSocket 权限控制逻辑
  showOverlay(type, message, subtext = '') {
    if (!this.overlay) return;
    this.overlay.style.display = 'flex';
    if (this.scoreboardContainer) {
      this.scoreboardContainer.style.filter = 'blur(8px)';
      this.scoreboardContainer.style.pointerEvents = 'none';
    }
    
    this.overlayText.textContent = message;
    this.overlaySubtext.textContent = subtext;
    
    if (type === 'loading') {
      this.overlayIcon.className = 'bx bx-loader-alt bx-spin';
      this.overlayIcon.style.color = 'var(--primary-color)';
      this.overlayBackBtn.style.display = 'none';
    } else if (type === 'error') {
      this.overlayIcon.className = 'bx bx-error-circle';
      this.overlayIcon.style.color = 'var(--danger)';
      this.overlayBackBtn.style.display = 'inline-flex';
    } else if (type === 'empty') {
      this.overlayIcon.className = 'bx bx-box';
      this.overlayIcon.style.color = 'var(--text-secondary)';
      this.overlayBackBtn.style.display = 'none'; // 通常 empty 状态是由侧边栏切来的，不用显示专门的回退按钮
    }
  }

  hideOverlay() {
    if (!this.overlay) return;
    this.overlay.style.display = 'none';
    if (this.scoreboardContainer) {
      this.scoreboardContainer.style.filter = 'none';
      this.scoreboardContainer.style.pointerEvents = 'auto';
    }
  }

  requestControl(matchId, force = false) {
    this.controlPending = true;
    const type = force ? 'FORCE_TAKE_CONTROL' : 'REQUEST_CONTROL';
    this.app.sendWsMessage(type, { matchId });
  }

  onControlResponse(payload) {
    if (!this.controlPending || !this.currentMatch || payload.matchId !== this.currentMatch.id) return;
    
    if (payload.success) {
      this.controlPending = false;
      this.hideOverlay();
      // 成功获取控制权，发送 START
      this.sendStartSignal();
      this.syncToWs();
    } else {
      // 获取控制权失败（被占用）
      this.showOverlay('error', '该比赛已被占用', '另一台设备正在控制此比赛。');
      setTimeout(() => {
        if (confirm(`⚠️ 警告：该场比赛正由另一台设备控制中！\n\n是否强行接管此比赛的裁判控制权？\n(注意：强行接管将踢出对方，并接管此比赛！)`)) {
          this.showOverlay('loading', '正在强行接管...', '请稍候...');
          this.requestControl(payload.matchId, true);
        } else {
          // 取消接管，退回
          this.controlPending = false;
          this.currentMatch = null;
          this.app.switchView('tournament');
        }
      }, 50);
    }
  }

  onControlLost(payload) {
    if (this.currentMatch && this.currentMatch.id === payload.matchId) {
      this.stopClock();
      this.currentMatch = null;
      alert('⚠️ 您的控制权已被另一台设备强制接管！\n为防止比分冲突，已安全退出控制面板。');
      this.app.switchView('tournament');
    }
  }
}
