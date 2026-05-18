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
    
    this.bindEvents();
  }

  bindEvents() {
    this.backBtn.addEventListener('click', async () => {
      this.stopClock();
      
      // 在返回对阵页面时，主动解锁比赛
      const t = this.app.store.tournament;
      if (t && this.currentMatch) {
        const match = t.currentMatches.find(m => m.id === this.currentMatch.id);
        if (match) {
          match.lockedBy = null;
          await this.app.saveStore('tournament', t);
        }
      }
      
      this.app.switchView('tournament');
    });

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
  }

  loadMatch(match, isRestore = false) {
    this.currentMatch = match;
    this.roundName.textContent = `当前对阵`;
    
    // 初始化队伍信息
    this.teams.home.id = match.team1.id;
    this.teams.home.el.name.textContent = match.team1.name;
    this.teams.away.id = match.team2.id;
    this.teams.away.el.name.textContent = match.team2.name;

    if (isRestore) {
      const saved = sessionStorage.getItem('hoops_manager_live_match');
      if (saved) {
        try {
          const liveData = JSON.parse(saved);
          this.teams.home.score = liveData.home.score;
          this.teams.home.fouls = liveData.home.fouls;
          this.teams.home.timeouts = liveData.home.timeouts;
          
          this.teams.away.score = liveData.away.score;
          this.teams.away.fouls = liveData.away.fouls;
          this.teams.away.timeouts = liveData.away.timeouts;
          
          this.timeRemaining = liveData.timeRemaining;
          this.renderClock();
          this.updateUI();
          return;
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

    this.resetClock();
    this.updateUI();
    this.saveLiveState();
  }

  saveLiveState() {
    if (!this.currentMatch) return;
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
      timeRemaining: this.timeRemaining
    };
    sessionStorage.setItem('hoops_manager_live_match', JSON.stringify(liveData));
  }

  updateScore(team, points) {
    this.teams[team].score += points;
    if (this.teams[team].score < 0) this.teams[team].score = 0;
    this.updateUI();
    this.saveLiveState();
  }

  updateStat(team, stat, value) {
    this.teams[team][stat] += value;
    if (this.teams[team][stat] < 0) this.teams[team][stat] = 0;
    this.updateUI();
    this.saveLiveState();
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
    
    this.timer = setInterval(() => {
      if (this.timeRemaining > 0) {
        this.timeRemaining--;
        this.renderClock();
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
  }

  resetClock() {
    this.stopClock();
    this.timeRemaining = 10 * 60;
    this.renderClock();
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
        match.lockedBy = null;
        
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
        sessionStorage.removeItem('hoops_manager_live_match');
        sessionStorage.removeItem('hoops_manager_active_match_id');

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

        alert(`比赛结束！胜者是：${match.winner.name}`);
        this.app.switchView('tournament');
      }
    }
  }
}
