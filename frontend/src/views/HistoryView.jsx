import React from 'react';
import { useApp } from '../context/AppContext';
import './HistoryView.css';

export default function HistoryView() {
  const { store } = useApp();
  const currentT = store.tournament;
  const pastT = store.pastTournaments || [];

  const isEmpty = (!currentT || !currentT.history || currentT.history.length === 0) && pastT.length === 0;

  const renderRoundMatches = (matches) => {
    return (
      <div className="history-list">
        {matches.map((m) => {
          if (m.isBye) {
            return (
              <div key={m.id} className="history-item is-bye">
                <span className="history-team winner">
                  <i className="bx bx-skip-next-circle"></i> {m.team1.name} (轮空晋级)
                </span>
              </div>
            );
          }

          const team1Winner = m.winner && m.winner.id === m.team1.id;
          const team2Winner = m.winner && m.winner.id === m.team2.id;

          return (
            <div key={m.id} className="history-item">
              <span className={`history-team ${team1Winner ? 'winner' : ''} home-side`}>
                {m.team1.name}
              </span>
              <span className="history-score">
                {m.score1} : {m.score2}
              </span>
              <span className={`history-team ${team2Winner ? 'winner' : ''} away-side`}>
                {m.team2.name}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTournamentHistory = (history) => {
    const reversedHistory = [...history].reverse();
    return (
      <>
        {reversedHistory.map((roundData, rIdx) => (
          <div key={rIdx} className="history-round">
            <h3 className="history-round-title">第 {roundData.round} 轮比赛</h3>
            {renderRoundMatches(roundData.matches)}
          </div>
        ))}
      </>
    );
  };

  if (isEmpty) {
    return (
      <section id="history" className="view-section active" style={{ display: 'block' }}>
        <header className="section-header">
          <h1>赛程记录</h1>
          <p>历史比分与晋级结果回顾。</p>
        </header>
        <div className="history-container">
          <div className="empty-state">
            <i className="bx bx-history"></i>
            <p>暂无比赛记录</p>
          </div>
        </div>
      </section>
    );
  }

  const reversedPast = [...pastT].reverse();

  return (
    <section id="history" className="view-section active" style={{ display: 'block' }}>
      <header className="section-header">
        <h1>赛程记录</h1>
        <p>历史比分与晋级结果回顾。</p>
      </header>
      <div className="history-container">
        <div id="bracket-container" className="bracket-wrapper">
          {/* 1. 当前进行中的赛程 */}
          {currentT && currentT.history && currentT.history.length > 0 && (
            <div className="history-tournament-card current">
              <div className="history-tournament-header">
                <h2 className="history-tournament-title current">
                  <i className="bx bx-play-circle"></i> 当前进行中的赛程
                </h2>
                <span className="history-tournament-live-badge">LIVE</span>
              </div>
              {renderTournamentHistory(currentT.history)}
            </div>
          )}

          {/* 2. 往届归档记录 */}
          {reversedPast.length > 0 && (
            <>
              <h2 className="history-section-title">
                <i className="bx bx-archive"></i> 往届归档记录
              </h2>
              {reversedPast.map((t, tIdx) => {
                const title = t.archivedAt ? `归档赛程 (${t.archivedAt})` : `归档赛程 ${reversedPast.length - tIdx}`;
                const hasChampion = t.activeTeams && t.activeTeams.length === 1;

                return (
                  <div key={tIdx} className="history-tournament-card archived">
                    <div className="history-tournament-header">
                      <h3 className="history-tournament-title">
                        <i className="bx bx-calendar-event"></i> {title}
                      </h3>
                      {hasChampion ? (
                        <div className="history-champion-badge">
                          <i className="bx bxs-trophy"></i> 冠军：{t.activeTeams[0].name}
                        </div>
                      ) : (
                        <div className="history-aborted-badge">
                          <i className="bx bx-info-circle"></i> 提前中止 (未决出冠军)
                        </div>
                      )}
                    </div>
                    {t.history && t.history.length > 0 ? (
                      renderTournamentHistory(t.history)
                    ) : (
                      <p className="history-empty-text">该赛程无比赛记录</p>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
