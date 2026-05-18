export class HistoryModule {
  constructor(app) {
    this.app = app;
    this.container = document.getElementById('bracket-container');
  }

  render() {
    const store = this.app.store;
    const currentT = store.tournament;
    const pastT = store.pastTournaments || [];

    if ((!currentT || !currentT.history || currentT.history.length === 0) && pastT.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <i class='bx bx-history'></i>
          <p>暂无比赛记录</p>
        </div>
      `;
      return;
    }

    let html = '';

    // 1. 渲染当前赛程记录（如果有）
    if (currentT && currentT.history && currentT.history.length > 0) {
      html += `
        <div class="history-tournament-card current">
          <div class="history-tournament-header">
            <h2 class="history-tournament-title current">
              <i class='bx bx-play-circle'></i> 当前进行中的赛程
            </h2>
            <span class="history-tournament-live-badge">LIVE</span>
          </div>
      `;
      const reversedHistory = [...currentT.history].reverse();
      html += this.renderTournamentHistory(reversedHistory);
      html += `</div>`;
    }

    // 2. 渲染往届已归档赛程记录（如果有）
    if (pastT.length > 0) {
      html += `<h2 class="history-section-title"><i class='bx bx-archive'></i> 往届归档记录</h2>`;
      
      const reversedPast = [...pastT].reverse();
      reversedPast.forEach((t, index) => {
        const title = t.archivedAt ? `归档赛程 (${t.archivedAt})` : `归档赛程 ${reversedPast.length - index}`;
        
        // 智能显示冠军
        let championBadge = '';
        if (t.activeTeams && t.activeTeams.length === 1) {
          championBadge = `
            <div class="history-champion-badge">
              <i class='bx bxs-trophy'></i> 冠军：${t.activeTeams[0].name}
            </div>
          `;
        } else {
          championBadge = `
            <div class="history-aborted-badge">
              <i class='bx bx-info-circle'></i> 提前中止 (未决出冠军)
            </div>
          `;
        }

        html += `
          <div class="history-tournament-card archived">
            <div class="history-tournament-header">
              <h3 class="history-tournament-title">
                <i class='bx bx-calendar-event'></i> ${title}
              </h3>
              ${championBadge}
            </div>
        `;
        
        if (t.history && t.history.length > 0) {
          const reversedHistory = [...t.history].reverse();
          html += this.renderTournamentHistory(reversedHistory);
        } else {
          html += `<p class="history-empty-text">该赛程无比赛记录</p>`;
        }
        html += `</div>`;
      });
    }

    this.container.innerHTML = html;
  }

  renderTournamentHistory(reversedHistory) {
    let html = '';
    reversedHistory.forEach(roundData => {
      html += `
        <div class="history-round">
          <h3 class="history-round-title">第 ${roundData.round} 轮比赛</h3>
          <div class="history-list">
      `;

      roundData.matches.forEach(m => {
        if (m.isBye) {
          html += `
            <div class="history-item is-bye">
              <span class="history-team winner"><i class='bx bx-skip-next-circle'></i> ${m.team1.name} (轮空晋级)</span>
            </div>
          `;
          return;
        }

        const team1Winner = m.winner && m.winner.id === m.team1.id;
        const team2Winner = m.winner && m.winner.id === m.team2.id;

        html += `
          <div class="history-item">
            <span class="history-team ${team1Winner ? 'winner' : ''} home-side">${m.team1.name}</span>
            <span class="history-score">${m.score1} : ${m.score2}</span>
            <span class="history-team ${team2Winner ? 'winner' : ''} away-side">${m.team2.name}</span>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });
    return html;
  }
}
