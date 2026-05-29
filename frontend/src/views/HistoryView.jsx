import React from 'react';
import { useApp } from '../context/AppContext';
import './HistoryView.css';

// 提取对阵列表中实际参与的所有队伍
const extractTeamsFromMatches = (matches) => {
  const teamsMap = {};
  matches.forEach(m => {
    if (m.team1 && m.team1.id && !m.team1.isBye) {
      teamsMap[m.team1.id] = m.team1;
    }
    if (m.team2 && m.team2.id && !m.team2.isBye) {
      teamsMap[m.team2.id] = m.team2;
    }
  });
  return Object.values(teamsMap);
};

// 积分榜动态计算逻辑
const calculateStandings = (matches, groupTeams) => {
  const standingsMap = {};

  groupTeams.forEach(team => {
    standingsMap[team.id] = {
      teamId: team.id,
      teamName: team.name,
      played: 0,
      won: 0,
      lost: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      scoreDiff: 0,
      points: 0,
      matchesList: []
    };
  });

  matches.forEach(m => {
    if (!m.completed) return;

    const t1 = standingsMap[m.team1.id];
    const t2 = standingsMap[m.team2.id];

    if (t1 && t2) {
      t1.played += 1;
      t2.played += 1;

      t1.scoreFor += m.score1;
      t1.scoreAgainst += m.score2;

      t2.scoreFor += m.score2;
      t2.scoreAgainst += m.score1;

      if (m.score1 > m.score2) {
        t1.won += 1;
        t1.points += 2;
        t2.lost += 1;
        t2.points += 1;
        t1.matchesList.push({ opponentId: m.team2.id, isWin: true, scoreFor: m.score1, scoreAgainst: m.score2 });
        t2.matchesList.push({ opponentId: m.team1.id, isWin: false, scoreFor: m.score2, scoreAgainst: m.score1 });
      } else {
        t2.won += 1;
        t2.points += 2;
        t1.lost += 1;
        t1.points += 1;
        t2.matchesList.push({ opponentId: m.team1.id, isWin: true, scoreFor: m.score2, scoreAgainst: m.score1 });
        t1.matchesList.push({ opponentId: m.team2.id, isWin: false, scoreFor: m.score1, scoreAgainst: m.score2 });
      }
    }
  });

  const list = Object.values(standingsMap).map(s => {
    s.scoreDiff = s.scoreFor - s.scoreAgainst;
    return s;
  });

  // 1. 先按积分归类分组
  const groupsByPoints = {};
  list.forEach(item => {
    if (!groupsByPoints[item.points]) {
      groupsByPoints[item.points] = [];
    }
    groupsByPoints[item.points].push(item);
  });

  // 2. 对每个积分相同的组进行组内专业排序
  const sortedList = [];
  const sortedPoints = Object.keys(groupsByPoints).map(Number).sort((a, b) => b - a);

  sortedPoints.forEach(pts => {
    const subList = groupsByPoints[pts];
    if (subList.length === 1) {
      sortedList.push(subList[0]);
    } else if (subList.length === 2) {
      // 2人积分相同：首要看两队直面胜负关系
      const [a, b] = subList;
      const matchA = a.matchesList.find(m => m.opponentId === b.teamId);
      let order = 0;
      if (matchA) {
        order = matchA.isWin ? -1 : 1;
      }
      
      if (order !== 0) {
        if (order === -1) {
          sortedList.push(a, b);
        } else {
          sortedList.push(b, a);
        }
      } else {
        // 如果没交手，看全部净胜分，再看总得分
        if (b.scoreDiff !== a.scoreDiff) {
          b.scoreDiff - a.scoreDiff > 0 ? sortedList.push(b, a) : sortedList.push(a, b);
        } else if (b.scoreFor !== a.scoreFor) {
          b.scoreFor - a.scoreFor > 0 ? sortedList.push(b, a) : sortedList.push(a, b);
        } else {
          sortedList.push(a, b);
        }
      }
    } else {
      // 3人及以上积分相同：根据这几队“彼此之间交手”的净胜分、总得分排序
      const subTeamIds = subList.map(item => item.teamId);
      
      subList.forEach(item => {
        let subScoreFor = 0;
        let subScoreAgainst = 0;
        item.matchesList.forEach(m => {
          if (subTeamIds.includes(m.opponentId)) {
            subScoreFor += m.scoreFor || 0;
            subScoreAgainst += m.scoreAgainst || 0;
          }
        });
        item._subScoreDiff = subScoreFor - subScoreAgainst;
        item._subScoreFor = subScoreFor;
      });

      subList.sort((a, b) => {
        if (b._subScoreDiff !== a._subScoreDiff) {
          return b._subScoreDiff - a._subScoreDiff;
        }
        if (b._subScoreFor !== a._subScoreFor) {
          return b._subScoreFor - a._subScoreFor;
        }
        if (b.scoreDiff !== a.scoreDiff) {
          return b.scoreDiff - a.scoreDiff;
        }
        if (b.scoreFor !== a.scoreFor) {
          return b.scoreFor - a.scoreFor;
        }
        return 0;
      });

      sortedList.push(...subList);
    }
  });

  return sortedList;
};

// 渲染历史归档的紧凑积分表
const renderHistoryStandingsTable = (standings, pCount) => {
  return (
    <div className="history-standings-table-wrapper" style={{ overflowX: 'auto', marginBottom: '1.25rem', border: '1px solid var(--panel-border)', borderRadius: '8px' }}>
      <table className="history-standings-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'center', backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--panel-border)', background: 'rgba(255, 255, 255, 0.02)', color: 'var(--text-secondary)' }}>
            <th style={{ padding: '0.6rem 0.5rem', width: '40px' }}>排名</th>
            <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }}>球队</th>
            <th style={{ padding: '0.6rem 0.5rem' }}>已赛</th>
            <th style={{ padding: '0.6rem 0.5rem' }}>胜 - 负</th>
            <th style={{ padding: '0.6rem 0.5rem' }}>得 / 失</th>
            <th style={{ padding: '0.6rem 0.5rem' }}>净胜分</th>
            <th style={{ padding: '0.6rem 0.5rem' }}>积分</th>
            <th style={{ padding: '0.6rem 0.5rem' }}>状态</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, idx) => {
            const isPromo = idx < pCount;
            return (
              <tr key={row.teamId} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', backgroundColor: isPromo ? 'rgba(34, 197, 94, 0.03)' : 'transparent' }}>
                <td style={{ padding: '0.6rem 0.5rem' }}>{idx + 1}</td>
                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>{row.teamName}</td>
                <td style={{ padding: '0.6rem 0.5rem' }}>{row.played}</td>
                <td style={{ padding: '0.6rem 0.5rem' }}>{row.won}W - {row.lost}L</td>
                <td style={{ padding: '0.6rem 0.5rem' }}>{row.scoreFor} / {row.scoreAgainst}</td>
                <td style={{ padding: '0.6rem 0.5rem', color: row.scoreDiff > 0 ? 'var(--success)' : row.scoreDiff < 0 ? 'var(--danger)' : '' }}>
                  {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                </td>
                <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600, color: 'var(--primary-color)' }}>{row.points}</td>
                <td style={{ padding: '0.6rem 0.5rem' }}>
                  {isPromo ? (
                    <span style={{ color: 'var(--success)', fontSize: '0.75rem', fontWeight: 600 }}>晋级</span>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>未出线</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

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

  const renderTournamentHistory = (history, tournamentData = {}) => {
    const reversedHistory = [...history].reverse();
    return (
      <>
        {reversedHistory.map((roundData, rIdx) => {
          const isGroupRound = roundData.round === '小组循环赛';
          
          if (isGroupRound) {
            const isMultiGroup = tournamentData.type === 'multi_group';
            const promoCount = tournamentData.promoCount || 2;
            const groupCount = tournamentData.groupCount || 2;
            
            return (
              <div key={rIdx} className="history-round group-history-round" style={{ borderBottom: '1px solid var(--panel-border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                <h3 className="history-round-title" style={{ color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <i className="bx bx-list-ol"></i> 小组循环赛积分榜
                </h3>
                
                <div className="history-group-standings" style={{ margin: '1rem 0 1.5rem 0' }}>
                  {!isMultiGroup ? (
                    <div className="history-single-group">
                      {renderHistoryStandingsTable(
                        calculateStandings(roundData.matches, extractTeamsFromMatches(roundData.matches)),
                        promoCount
                      )}
                    </div>
                  ) : (
                    <div className={`history-multi-groups ${groupCount === 4 ? 'four-groups' : ''}`}>
                      {(groupCount === 2 ? ['A', 'B'] : ['A', 'B', 'C', 'D']).map(gName => {
                        const gMatches = roundData.matches.filter(m => m.group === gName);
                        const gTeams = extractTeamsFromMatches(gMatches);
                        const gStandings = calculateStandings(gMatches, gTeams);
                        return (
                          <div key={gName} className="history-group-card" style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '1rem' }}>
                            <h4 style={{ color: 'var(--primary-color)', marginBottom: '0.5rem', fontWeight: 600 }}>{gName} 组积分</h4>
                            {renderHistoryStandingsTable(gStandings, promoCount)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                
                <h4 className="history-sub-title" style={{ color: '#fff', fontSize: '0.9rem', marginBottom: '0.75rem', fontWeight: 600 }}>小组赛对阵记录</h4>
                {renderRoundMatches(roundData.matches)}
              </div>
            );
          }
          
          return (
            <div key={rIdx} className="history-round">
              <h3 className="history-round-title">第 {roundData.round} 轮比赛</h3>
              {renderRoundMatches(roundData.matches)}
            </div>
          );
        })}
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
              {renderTournamentHistory(currentT.history, currentT)}
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
                      renderTournamentHistory(t.history, t)
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
