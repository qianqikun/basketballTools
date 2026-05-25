import React from 'react';
import { useApp } from '../context/AppContext';
import { useWebSocket } from '../context/WebSocketContext';
import './DrawView.css';

export default function DrawView({ onStartMatch }) {
  const { store, saveStore, loadStore, currentUser } = useApp();
  const { sendWsMessage } = useWebSocket();

  const teams = store.teams || [];
  const t = store.tournament;
  const isAdmin = currentUser && currentUser.role === 'admin';

  const drawLots = () => {
    if (!isAdmin) {
      alert('权限不足，仅系统管理员可执行随机抽签！');
      return;
    }

    if (!t && teams.length === 0) {
      alert('没有可参与抽签的队伍，请先在报名管理中添加。');
      return;
    }

    const currentT = t ? { ...t } : {
      round: 1,
      activeTeams: [...teams],
      currentMatches: [],
      history: []
    };

    if (!currentT.activeTeams || currentT.activeTeams.length === 0) {
      alert('没有可参与抽签的队伍，请先在报名管理中添加。');
      return;
    }

    if (currentT.activeTeams.length === 1) {
      alert(`比赛已结束，冠军是：${currentT.activeTeams[0].name}`);
      return;
    }

    if (currentT.currentMatches && currentT.currentMatches.length > 0 && !currentT.currentMatches.every(m => m.completed)) {
      alert('当前轮次还有未完成的比赛，无法重新抽签。');
      return;
    }

    // 打乱顺序
    const shuffled = [...currentT.activeTeams].sort(() => Math.random() - 0.5);
    const matches = [];

    let index = 0;
    let matchIdCount = 1;
    while (index < shuffled.length) {
      if (index + 1 < shuffled.length) {
        matches.push({
          id: `r${currentT.round}_m${matchIdCount++}`,
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
          id: `r${currentT.round}_m${matchIdCount++}`,
          team1: shuffled[index],
          team2: null,
          completed: true,
          winner: shuffled[index],
          score1: 0,
          score2: 0,
          isBye: true
        });
        index++;
      }
    }

    currentT.currentMatches = matches;
    saveStore('tournament', currentT);
  };

  const endTournament = () => {
    if (!isAdmin) {
      alert('权限不足，仅系统管理员可执行归档操作！');
      return;
    }
    if (!t) return;

    if (confirm('确定要结束并归档当前的赛程吗？此操作不可撤销，结束之后可以开启一个新赛程。')) {
      const pastTournaments = store.pastTournaments || [];
      const currentT = { ...t };
      currentT.archivedAt = new Date().toLocaleString();

      if (currentT.currentMatches && currentT.currentMatches.length > 0) {
        currentT.history.push({
          round: currentT.round,
          matches: JSON.parse(JSON.stringify(currentT.currentMatches)),
          isPartial: true
        });

        // 归档时通知 WS 服务端清除并关闭该赛程所有正在进行的直播看板
        currentT.currentMatches.forEach(m => {
          sendWsMessage('MATCH_END', { matchId: m.id });
        });
      }

      const updatedPast = [...pastTournaments, currentT];
      
      saveStore({
        pastTournaments: updatedPast,
        tournament: null
      });

      // 清除本地比赛缓存
      localStorage.removeItem('hoops_manager_live_match');
      localStorage.removeItem('hoops_manager_active_match_id');
      
      alert('当前赛程已结束并归档。您可以继续随机抽签开启新赛程！');
    }
  };

  const handleStartMatch = async (match) => {
    // 进入比赛前先从后端同步最新数据库，防脏读
    await loadStore();
    onStartMatch(match);
  };

  // 渲染判断
  const renderContent = () => {
    // 1. 如果决出冠军
    if (t && t.activeTeams && t.activeTeams.length === 1) {
      return (
        <div className="empty-state" style={{ borderColor: 'var(--primary-color)' }}>
          <i className="bx bxs-trophy" style={{ color: 'var(--primary-color)', fontSize: '4rem' }}></i>
          <p style={{ fontSize: '1.5rem', color: '#fff', margin: '1rem 0' }}>
            冠军诞生：{t.activeTeams[0].name}
          </p>
          <p>
            {isAdmin ? '请点击右上角按钮归档本届赛程，以便在历史记录中永久保存' : '请等待系统管理员归档本届赛程'}
          </p>
        </div>
      );
    }

    // 2. 如果等待抽签（无当前对阵）
    if (!t || !t.currentMatches || t.currentMatches.length === 0) {
      return (
        <div className="empty-state">
          <i className="bx bx-box"></i>
          <p>
            {isAdmin ? '暂无对阵信息，请先进行抽签开启赛程' : '暂无对阵信息，请等待管理员抽签开启比赛'}
          </p>
        </div>
      );
    }

    // 3. 正常渲染对阵
    return (
      <div className="matchups-grid" id="matchups-container">
        {t.currentMatches.map((m) => {
          if (m.isBye) {
            return (
              <div key={m.id} className="matchup-card" style={{ opacity: 0.7 }}>
                <div className="matchup-team winner">
                  <span>{m.team1.name} (轮空晋级)</span>
                </div>
              </div>
            );
          }

          const team1Class = m.winner && m.winner.id === m.team1.id ? 'winner' : '';
          const team2Class = m.winner && m.winner.id === m.team2.id ? 'winner' : '';

          return (
            <div key={m.id} className="matchup-card">
              <div className={`matchup-team ${team1Class}`}>
                <span>{m.team1.name}</span>
                <span>{m.completed ? m.score1 : '-'}</span>
              </div>
              <div className={`matchup-team ${team2Class}`}>
                <span>{m.team2.name}</span>
                <span>{m.completed ? m.score2 : '-'}</span>
              </div>
              {!m.completed ? (
                <button className="primary-btn play-match-btn" onClick={() => handleStartMatch(m)}>
                  <i className="bx bx-play"></i> 进入比赛
                </button>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--success)', marginTop: '1rem' }}>
                  <i className="bx bx-check"></i> 已完赛
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // 渲染历史已结束轮次
  const renderHistoryRounds = () => {
    if (!t || !t.history || t.history.length === 0) return null;

    return (
      <div id="draw-history-container" style={{ marginTop: '3rem' }}>
        <h3 style={{
          margin: '2.5rem 0 1.5rem 0',
          fontSize: '1.25rem',
          color: '#fff',
          borderTop: '1px solid var(--panel-border)',
          paddingTop: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <i className="bx bx-history"></i> 本届已结束轮次
        </h3>
        {t.history.map((roundData, rIdx) => (
          <div key={rIdx} className="draw-history-round" style={{ marginBottom: '2rem' }}>
            <h4 style={{
              color: 'var(--primary-color)',
              borderLeft: '3px solid var(--primary-color)',
              paddingLeft: '0.75rem',
              marginBottom: '1rem',
              fontSize: '1.1rem',
              fontWeight: 600
            }}>
              第 {roundData.round} 轮
            </h4>
            <div className="matchups-grid" style={{ opacity: 0.75, pointerEvents: 'none' }}>
              {roundData.matches.map((m) => {
                if (m.isBye) {
                  return (
                    <div key={m.id} className="matchup-card">
                      <div className="matchup-team winner">
                        <span>{m.team1.name} (轮空晋级)</span>
                      </div>
                    </div>
                  );
                }

                const team1Class = m.winner && m.winner.id === m.team1.id ? 'winner' : '';
                const team2Class = m.winner && m.winner.id === m.team2.id ? 'winner' : '';

                return (
                  <div key={m.id} className="matchup-card">
                    <div className={`matchup-team ${team1Class}`}>
                      <span>{m.team1.name}</span>
                      <span>{m.score1}</span>
                    </div>
                    <div className={`matchup-team ${team2Class}`}>
                      <span>{m.team2.name}</span>
                      <span>{m.score2}</span>
                    </div>
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '1rem', fontSize: '0.85rem' }}>
                      <i className="bx bx-check-circle"></i> 已完赛
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // 按钮文本判定
  const allCompleted = t && t.currentMatches && t.currentMatches.length > 0 && t.currentMatches.every(m => m.completed);
  const drawBtnText = allCompleted ? '抽取下一轮' : '随机抽签';
  const showEndBtn = t && (t.activeTeams && t.activeTeams.length === 1 || t.currentMatches && t.currentMatches.length > 0);

  return (
    <section id="tournament" className="view-section active" style={{ display: 'block' }}>
      <header className="section-header">
        <h1>抽签与对阵</h1>
        <p>当前阶段比赛的随机抽签与对阵表生成。</p>
      </header>
      <div className="tournament-container">
        <div className="action-bar">
          <h3>
            {t && t.activeTeams && t.activeTeams.length === 1 ? (
              `🏆 比赛结束 冠军：${t.activeTeams[0].name}`
            ) : t ? (
              `第 ${t.round} 轮`
            ) : (
              '等待抽签'
            )}
          </h3>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {isAdmin && (!t || (t.activeTeams && t.activeTeams.length > 1)) && (
              <button
                id="draw-lots-btn"
                className="primary-btn"
                onClick={drawLots}
                disabled={t && t.currentMatches && t.currentMatches.length > 0 && !allCompleted}
              >
                <i className="bx bx-shuffle"></i> {drawBtnText}
              </button>
            )}
            {isAdmin && showEndBtn && (
              <button id="end-tournament-btn" className="danger-btn" style={{ width: 'auto' }} onClick={endTournament}>
                <i className="bx bx-archive-in"></i> {t.activeTeams && t.activeTeams.length === 1 ? '归档本届赛程' : '结束并归档赛程'}
              </button>
            )}
          </div>
        </div>

        {renderContent()}
        {renderHistoryRounds()}
      </div>
    </section>
  );
}
