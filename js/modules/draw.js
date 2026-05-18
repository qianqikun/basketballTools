export class DrawModule {
  constructor(app) {
    this.app = app;
    this.drawBtn = document.getElementById('draw-lots-btn');
    this.endBtn = document.getElementById('end-tournament-btn');
    this.container = document.getElementById('matchups-container');
    this.historyContainer = document.getElementById('draw-history-container');
    this.roundTitle = document.getElementById('current-round-title');
    
    this.bindEvents();
    this.render();
  }

  bindEvents() {
    this.drawBtn.addEventListener('click', () => {
      this.drawLots();
    });

    this.endBtn.addEventListener('click', () => {
      this.endTournament();
    });

    this.container.addEventListener('click', (e) => {
      if (e.target.closest('.play-match-btn')) {
        const matchId = e.target.closest('.play-match-btn').dataset.id;
        this.startMatch(matchId);
      }
    });
  }

  endTournament() {
    const store = this.app.store;
    if (!store.tournament) return;
    
    if (confirm('确定要结束并归档当前的赛程吗？此操作不可撤销，结束之后可以开启一个新赛程。')) {
      if (!store.pastTournaments) {
        store.pastTournaments = [];
      }
      
      const t = store.tournament;
      t.archivedAt = new Date().toLocaleString();
      
      // 如果当前轮次有打完的比赛也算进历史
      if (t.currentMatches && t.currentMatches.length > 0) {
        t.history.push({
          round: t.round,
          matches: JSON.parse(JSON.stringify(t.currentMatches)),
          isPartial: true
        });
      }
      
      store.pastTournaments.push(t);
      this.app.saveStore('pastTournaments', store.pastTournaments);
      
      // 重置当前赛程
      this.app.saveStore('tournament', null);
      this.render();
      alert('当前赛程已结束并归档。您可以继续随机抽签开启新赛程！');
    }
  }

  drawLots() {
    const store = this.app.store;
    // 如果没有初始化 tournament 对象
    if (!store.tournament) {
      store.tournament = {
        round: 1,
        activeTeams: store.teams ? [...store.teams] : [],
        currentMatches: [],
        history: [] // [{round: 1, matches: []}]
      };
    }

    const t = store.tournament;

    // 检查是否有队伍
    if (!t.activeTeams || t.activeTeams.length === 0) {
      alert('没有可参与抽签的队伍，请先在报名管理中添加。');
      return;
    }

    if (t.activeTeams.length === 1) {
      alert(`比赛已结束，冠军是：${t.activeTeams[0].name}`);
      return;
    }

    if (t.currentMatches && t.currentMatches.length > 0 && !t.currentMatches.every(m => m.completed)) {
      alert('当前轮次还有未完成的比赛，无法重新抽签。');
      return;
    }

    // 执行抽签（如果上一轮已全部打完，或者这是第一轮）
    // 打乱顺序
    const shuffled = [...t.activeTeams].sort(() => Math.random() - 0.5);
    const matches = [];

    // 处理轮空
    let index = 0;
    let matchIdCount = 1;
    while (index < shuffled.length) {
      if (index + 1 < shuffled.length) {
        matches.push({
          id: `r${t.round}_m${matchIdCount++}`,
          team1: shuffled[index],
          team2: shuffled[index + 1],
          completed: false,
          winner: null,
          score1: 0,
          score2: 0
        });
        index += 2;
      } else {
        // 轮空直接晋级
        matches.push({
          id: `r${t.round}_m${matchIdCount++}`,
          team1: shuffled[index],
          team2: null, // null 代表轮空
          completed: true,
          winner: shuffled[index], // 直接晋级
          score1: 0,
          score2: 0,
          isBye: true
        });
        index++;
      }
    }

    // 更新状态
    t.currentMatches = matches;
    this.app.saveStore('tournament', t);
    this.render();
  }

  async startMatch(matchId) {
    // 1. 进入比赛前先从后端同步最新数据库，防脏读
    await this.app.loadStore();

    const t = this.app.store.tournament;
    const match = t.currentMatches.find(m => m.id === matchId);
    if (!match) return;
    
    const myClientId = this.app.getClientId();

    // 2. 检查此比赛是否被其他设备锁定
    if (match.lockedBy && match.lockedBy !== myClientId) {
      if (confirm('⚠️ 警告：该场比赛正由其他裁判在另一台设备上进行中！\n\n是否强行接管并解锁此比赛？\n(注意：强行接管将清除对方的锁定，允许您控制该场比赛，但可能会覆盖对方未提交的数据)')) {
        // 强制解锁并接管
        match.lockedBy = myClientId;
        await this.app.saveStore('tournament', t);
      } else {
        this.render(); // 刷新界面以反映最新锁定状态
        return;
      }
    } else if (!match.lockedBy) {
      // 3. 如果没被锁定，自己锁定它
      match.lockedBy = myClientId;
      await this.app.saveStore('tournament', t);
    }

    // 检测是否可以恢复本地临时比赛数据
    const saved = sessionStorage.getItem('hoops_manager_live_match');
    let isRestore = false;
    if (saved) {
      try {
        const liveData = JSON.parse(saved);
        if (liveData.matchId === matchId) {
          isRestore = true;
        }
      } catch (e) {}
    }

    // 通知 app 切换到比赛界面，并初始化或恢复数据
    this.app.startMatch(match, isRestore);
  }

  render() {
    const t = this.app.store.tournament;
    
    // 如果已经决出冠军
    if (t && t.activeTeams && t.activeTeams.length === 1) {
      this.roundTitle.textContent = `🏆 比赛结束 冠军：${t.activeTeams[0].name}`;
      this.drawBtn.style.display = 'none';
      this.endBtn.style.display = 'block';
      this.endBtn.innerHTML = "<i class='bx bx-archive-in'></i> 归档本届赛程";
      this.container.innerHTML = `
        <div class="empty-state" style="border-color: var(--primary-color);">
          <i class='bx bxs-trophy' style="color: var(--primary-color); font-size: 4rem;"></i>
          <p style="font-size: 1.5rem; color: #fff; margin: 1rem 0;">冠军诞生：${t.activeTeams[0].name}</p>
          <p>请点击右上角按钮归档本届赛程，以便在历史记录中永久保存</p>
        </div>
      `;
      this.renderHistoryRounds();
      return;
    }

    if (!t || (!t.currentMatches || t.currentMatches.length === 0)) {
      this.roundTitle.textContent = '等待抽签';
      this.drawBtn.style.display = 'inline-flex';
      this.drawBtn.disabled = false;
      this.endBtn.style.display = 'none';
      this.container.innerHTML = `
        <div class="empty-state">
          <i class='bx bx-box'></i>
          <p>暂无对阵信息，请先进行抽签开启赛程</p>
        </div>
      `;
      this.renderHistoryRounds();
      return;
    }

    this.drawBtn.style.display = 'inline-flex';
    this.endBtn.style.display = 'block';
    this.endBtn.innerHTML = "<i class='bx bx-archive-in'></i> 结束并归档赛程";
    this.roundTitle.textContent = `第 ${t.round} 轮`;

    // 如果所有比赛都已完成，允许进入下一轮抽签
    const allCompleted = t.currentMatches.every(m => m.completed);
    this.drawBtn.disabled = !allCompleted;
    if (allCompleted) {
      this.drawBtn.innerHTML = "<i class='bx bx-shuffle'></i> 抽取下一轮";
    } else {
      this.drawBtn.innerHTML = "<i class='bx bx-shuffle'></i> 随机抽签";
    }

    this.container.innerHTML = t.currentMatches.map(m => {
      if (m.isBye) {
        return `
          <div class="matchup-card" style="opacity: 0.7">
            <div class="matchup-team winner">
              <span>${m.team1.name} (轮空晋级)</span>
            </div>
          </div>
        `;
      }

      const team1Class = m.winner && m.winner.id === m.team1.id ? 'winner' : '';
      const team2Class = m.winner && m.winner.id === m.team2.id ? 'winner' : '';

      return `
        <div class="matchup-card">
          <div class="matchup-team ${team1Class}">
            <span>${m.team1.name}</span>
            <span>${m.completed ? m.score1 : '-'}</span>
          </div>
          <div class="matchup-team ${team2Class}">
            <span>${m.team2.name}</span>
            <span>${m.completed ? m.score2 : '-'}</span>
          </div>
          ${!m.completed ? `<button class="primary-btn play-match-btn" data-id="${m.id}"><i class='bx bx-play'></i> 进入比赛</button>` : ''}
          ${m.completed ? `<div style="text-align:center; color: var(--success); margin-top: 1rem;"><i class='bx bx-check'></i> 已完赛</div>` : ''}
        </div>
      `;
    }).join('');

    this.renderHistoryRounds();
  }

  renderHistoryRounds() {
    const t = this.app.store.tournament;
    if (!this.historyContainer) return;
    
    if (!t || !t.history || t.history.length === 0) {
      this.historyContainer.innerHTML = '';
      return;
    }

    // 正序展示，从第一轮到最新完成的轮次，清晰展现晋级路径
    let html = '<h3 style="margin: 2.5rem 0 1.5rem 0; font-size: 1.25rem; color: #fff; border-top: 1px solid var(--panel-border); padding-top: 2rem; display: flex; align-items: center; gap: 0.5rem;"><i class="bx bx-history"></i> 本届已结束轮次</h3>';
    
    t.history.forEach(roundData => {
      html += `
        <div class="draw-history-round" style="margin-bottom: 2rem;">
          <h4 style="color: var(--primary-color); border-left: 3px solid var(--primary-color); padding-left: 0.75rem; margin-bottom: 1rem; font-size: 1.1rem; font-weight: 600;">
            第 ${roundData.round} 轮
          </h4>
          <div class="matchups-grid" style="opacity: 0.75; pointer-events: none;">
      `;

      roundData.matches.forEach(m => {
        if (m.isBye) {
          html += `
            <div class="matchup-card">
              <div class="matchup-team winner">
                <span>${m.team1.name} (轮空晋级)</span>
              </div>
            </div>
          `;
          return;
        }

        const team1Class = m.winner && m.winner.id === m.team1.id ? 'winner' : '';
        const team2Class = m.winner && m.winner.id === m.team2.id ? 'winner' : '';

        html += `
          <div class="matchup-card">
            <div class="matchup-team ${team1Class}">
              <span>${m.team1.name}</span>
              <span>${m.score1}</span>
            </div>
            <div class="matchup-team ${team2Class}">
              <span>${m.team2.name}</span>
              <span>${m.score2}</span>
            </div>
            <div style="text-align:center; color: var(--text-secondary); margin-top: 1rem; font-size: 0.85rem;"><i class='bx bx-check-circle'></i> 已完赛</div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    this.historyContainer.innerHTML = html;
  }
}
