import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useWebSocket } from '../context/WebSocketContext';
import './DrawView.css';

// 1. 经典单循环对阵生成算法 (Round Robin / Circle Method)
const generateRoundRobinMatches = (teamsList, groupName = null) => {
  let list = [...teamsList];
  // 打乱顺序以保证抽签随机性
  list.sort(() => Math.random() - 0.5);

  const isOdd = list.length % 2 !== 0;
  if (isOdd) {
    // 奇数队伍在算法里加入虚拟 Bye 轮空队
    list.push({ id: 'bye_placeholder', name: '轮空占位', isBye: true });
  }

  const numTeams = list.length;
  const numRounds = numTeams - 1;
  const matches = [];

  for (let round = 0; round < numRounds; round++) {
    for (let i = 0; i < numTeams / 2; i++) {
      const home = (round + i) % (numTeams - 1);
      let away = (numTeams - 1 - i + round) % (numTeams - 1);

      if (i === 0) {
        away = numTeams - 1;
      }

      const team1 = list[home];
      const team2 = list[away];

      // 过滤掉包含虚拟轮空队的比赛，达到轮空轮歇效果
      if (team1.isBye || team2.isBye) {
        continue;
      }

      matches.push({
        id: `g_${groupName || 'single'}_r${round + 1}_m${i + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        team1,
        team2,
        completed: false,
        winner: null,
        score1: 0,
        score2: 0,
        group: groupName,
        round: round + 1
      });
    }
  }

  return matches;
};

// 2. 积分榜动态计算逻辑
const calculateStandings = (matches, groupTeams) => {
  const standingsMap = {};

  // 初始化该组内所有球队的初始数据
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
      matchesList: [] // 记录胜负关系以用于积分相同时的判定
    };
  });

  // 累加已完赛比赛的数据
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
        t1.points += 2; // 篮球赛制：胜积 2 分

        t2.lost += 1;
        t2.points += 1; // 负积 1 分

        t1.matchesList.push({ opponentId: m.team2.id, isWin: true });
        t2.matchesList.push({ opponentId: m.team1.id, isWin: false });
      } else {
        t2.won += 1;
        t2.points += 2;

        t1.lost += 1;
        t1.points += 1;

        t2.matchesList.push({ opponentId: m.team1.id, isWin: true });
        t1.matchesList.push({ opponentId: m.team2.id, isWin: false });
      }
    }
  });

  // 计算净胜分并转为列表
  const list = Object.values(standingsMap).map(s => {
    s.scoreDiff = s.scoreFor - s.scoreAgainst;
    return s;
  });

  // 严谨篮球排名规则排序：1. 积分 -> 2. 净胜分 -> 3. 总得分 -> 4. 胜负关系
  list.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    if (b.scoreDiff !== a.scoreDiff) {
      return b.scoreDiff - a.scoreDiff;
    }
    if (b.scoreFor !== a.scoreFor) {
      return b.scoreFor - a.scoreFor;
    }
    // 检查胜负关系
    const directMatch = a.matchesList.find(m => m.opponentId === b.teamId);
    if (directMatch) {
      return directMatch.isWin ? -1 : 1;
    }
    return 0;
  });

  return list;
};

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

// 3. 小组循环赛完赛后，一键生成淘汰赛对决
const generatePlayoffMatches = (tournament) => {
  const { type, promoCount, groupCount, currentMatches, groups } = tournament;

  // 1. 计算各个小组的最终积分榜
  const standings = {};
  if (type === 'single_group') {
    standings['single'] = calculateStandings(currentMatches, tournament.activeTeams);
  } else {
    Object.keys(groups).forEach(gName => {
      standings[gName] = calculateStandings(
        currentMatches.filter(m => m.group === gName),
        groups[gName]
      );
    });
  }

  // 2. 取出各组晋级的队伍对象
  const promoTeams = {};
  Object.keys(standings).forEach(gName => {
    promoTeams[gName] = standings[gName].slice(0, promoCount).map(s => {
      return tournament.activeTeams.find(t => t.id === s.teamId);
    });
  });

  const nextActiveTeams = [];
  const nextMatches = [];

  if (type === 'single_group') {
    const list = promoTeams['single'];
    nextActiveTeams.push(...list);

    // 根据晋级人数决定首轮对局
    if (list.length === 4) {
      // 4强：半决赛交叉 (1 vs 4, 2 vs 3)
      nextMatches.push(
        { id: `r1_m1`, team1: list[0], team2: list[3], completed: false, winner: null, score1: 0, score2: 0 },
        { id: `r1_m2`, team1: list[1], team2: list[2], completed: false, winner: null, score1: 0, score2: 0 }
      );
    } else if (list.length === 2) {
      // 2强：直接进入决赛
      nextMatches.push(
        { id: `r1_m1`, team1: list[0], team2: list[1], completed: false, winner: null, score1: 0, score2: 0 }
      );
    } else {
      // 其它出线人数直接两两对阵 (兜底)
      let idx = 0;
      let mCount = 1;
      while (idx < list.length) {
        if (idx + 1 < list.length) {
          nextMatches.push({ id: `r1_m${mCount++}`, team1: list[idx], team2: list[idx + 1], completed: false, winner: null, score1: 0, score2: 0 });
          idx += 2;
        } else {
          nextMatches.push({ id: `r1_m${mCount++}`, team1: list[idx], team2: null, completed: true, winner: list[idx], score1: 0, score2: 0, isBye: true });
          idx++;
        }
      }
    }
  } else {
    // 多小组出线交叉淘汰
    if (groupCount === 2) {
      const aList = promoTeams['A'] || [];
      const bList = promoTeams['B'] || [];
      nextActiveTeams.push(...aList, ...bList);

      if (promoCount === 2) {
        // 4支队：半决赛 A1-B2, B1-A2
        nextMatches.push(
          { id: `r1_m1`, team1: aList[0], team2: bList[1], completed: false, winner: null, score1: 0, score2: 0 },
          { id: `r1_m2`, team1: bList[0], team2: aList[1], completed: false, winner: null, score1: 0, score2: 0 }
        );
      } else if (promoCount === 1) {
        // 2支队：直接决赛 A1-B1
        nextMatches.push(
          { id: `r1_m1`, team1: aList[0], team2: bList[0], completed: false, winner: null, score1: 0, score2: 0 }
        );
      } else {
        const combined = [...aList, ...bList];
        let mCount = 1;
        for (let i = 0; i < combined.length; i += 2) {
          if (i + 1 < combined.length) {
            nextMatches.push({ id: `r1_m${mCount++}`, team1: combined[i], team2: combined[i+1], completed: false, winner: null, score1: 0, score2: 0 });
          } else {
            nextMatches.push({ id: `r1_m${mCount++}`, team1: combined[i], team2: null, completed: true, winner: combined[i], score1: 0, score2: 0, isBye: true });
          }
        }
      }
    } else if (groupCount === 4) {
      const aList = promoTeams['A'] || [];
      const bList = promoTeams['B'] || [];
      const cList = promoTeams['C'] || [];
      const dList = promoTeams['D'] || [];
      nextActiveTeams.push(...aList, ...bList, ...cList, ...dList);

      if (promoCount === 2) {
        // 8支队：四分之一决赛 A1-B2, C1-D2, B1-A2, D1-C2
        nextMatches.push(
          { id: `r1_m1`, team1: aList[0], team2: bList[1], completed: false, winner: null, score1: 0, score2: 0 },
          { id: `r1_m2`, team1: cList[0], team2: dList[1], completed: false, winner: null, score1: 0, score2: 0 },
          { id: `r1_m3`, team1: bList[0], team2: aList[1], completed: false, winner: null, score1: 0, score2: 0 },
          { id: `r1_m4`, team1: dList[0], team2: cList[1], completed: false, winner: null, score1: 0, score2: 0 }
        );
      } else if (promoCount === 1) {
        // 4支队：半决赛 A1-B1, C1-D1
        nextMatches.push(
          { id: `r1_m1`, team1: aList[0], team2: bList[0], completed: false, winner: null, score1: 0, score2: 0 },
          { id: `r1_m2`, team1: cList[0], team2: dList[0], completed: false, winner: null, score1: 0, score2: 0 }
        );
      } else {
        const combined = [...aList, ...bList, ...cList, ...dList];
        let mCount = 1;
        for (let i = 0; i < combined.length; i += 2) {
          if (i + 1 < combined.length) {
            nextMatches.push({ id: `r1_m${mCount++}`, team1: combined[i], team2: combined[i+1], completed: false, winner: null, score1: 0, score2: 0 });
          } else {
            nextMatches.push({ id: `r1_m${mCount++}`, team1: combined[i], team2: null, completed: true, winner: combined[i], score1: 0, score2: 0, isBye: true });
          }
        }
      }
    }
  }

  return {
    type: tournament.type,
    stage: 'knockout',
    round: 1,
    activeTeams: nextActiveTeams,
    currentMatches: nextMatches,
    promoCount: tournament.promoCount, // 保留名额数
    groupCount: tournament.groupCount, // 保留小组数
    groups: tournament.groups,         // 保留初始分组
    history: [
      {
        round: '小组循环赛',
        matches: JSON.parse(JSON.stringify(currentMatches))
      }
    ]
  };
};

export default function DrawView({ onStartMatch }) {
  const { store, saveStore, loadStore, currentUser } = useApp();
  const { sendWsMessage } = useWebSocket();

  const teams = store.teams || [];
  const t = store.tournament;
  const isAdmin = currentUser && currentUser.role === 'admin';

  // 赛制配置面板状态
  const [formatType, setFormatType] = useState('knockout'); // 'knockout' | 'single_group' | 'multi_group'
  const [groupCount, setGroupCount] = useState(2); // 2 | 4
  const [promoCount, setPromoCount] = useState(2); // 1 | 2 | 3
  const [isGroupStandingsOpen, setIsGroupStandingsOpen] = useState(true); // 淘汰赛阶段控制循环赛积分榜展开/收起

  // 计算合法均分的可选状态
  const canDiv2 = teams.length >= 4 && teams.length % 2 === 0;
  const canDiv4 = teams.length >= 8 && teams.length % 4 === 0;
  const canMultiGroup = canDiv2 || canDiv4;

  // 1. 当球队总数变动，导致当前选中的多小组循环赛不合法时，自动回退到淘汰赛
  useEffect(() => {
    if (formatType === 'multi_group' && !canMultiGroup) {
      setFormatType('knockout');
    }
  }, [teams.length, formatType, canMultiGroup]);

  // 2. 当选中多小组循环赛时，若选中的小组数在当前人数下无法均分，自动切换为可整除的小组数
  useEffect(() => {
    if (formatType === 'multi_group') {
      if (groupCount === 4 && !canDiv4) {
        setGroupCount(2);
      }
    }
  }, [formatType, groupCount, teams.length, canDiv4]);

  // 3. 当晋级人数超过每组（或大组）人数上限时，自动调降晋级名额数以防产生越界/无意义赛程
  useEffect(() => {
    const groupSize = formatType === 'single_group' 
      ? teams.length 
      : (formatType === 'multi_group' ? teams.length / groupCount : 99);
    
    // 每组晋级人数必须严格小于每组球队总数
    const maxPromo = groupSize - 1;
    if (promoCount > maxPromo && maxPromo >= 1) {
      setPromoCount(Math.max(1, Math.floor(maxPromo)));
    }
  }, [formatType, groupCount, teams.length, promoCount]);

  const isOddTeams = teams.length % 2 !== 0;

  // 抽签与开启赛程
  const drawLots = () => {
    if (!isAdmin) {
      alert('权限不足，仅系统管理员可执行抽签！');
      return;
    }

    // 🚨 核心逻辑修复：如果已经处于淘汰赛阶段（不管是原生淘汰赛还是循环赛演进出的淘汰赛），
    // 再次点击“抽取下一轮”时，必须根据留在场上的 t.activeTeams 进行下一轮对局抽签！
    if (t && t.stage !== 'group') {
      if (!t.activeTeams || t.activeTeams.length === 0) {
        alert('没有可参与抽签的队伍！');
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

      // 执行淘汰赛下一轮抽签，打乱顺序
      const shuffled = [...t.activeTeams].sort(() => Math.random() - 0.5);
      const matches = [];
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
          // 奇数队伍下自动轮空晋级
          matches.push({
            id: `r${t.round}_m${matchIdCount++}`,
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

      saveStore('tournament', {
        ...t,
        currentMatches: matches
      });
      return;
    }

    if (teams.length < 2) {
      alert('至少需要 2 支队伍才能开启抽签对阵！');
      return;
    }

    // 多小组循环赛防呆校验
    if (formatType === 'multi_group') {
      if (!canMultiGroup) {
        alert(`当前已报名球队数量 (${teams.length} 支) 无法被 2 或 4 个小组等分，请重新选择赛制！`);
        return;
      }
      if (groupCount === 2 && !canDiv2) {
        alert(`当前队伍数 (${teams.length} 支) 无法被 2 组均分！`);
        return;
      }
      if (groupCount === 4 && !canDiv4) {
        alert(`当前队伍数 (${teams.length} 支) 无法被 4 组均分！`);
        return;
      }

      const groupSize = teams.length / groupCount;
      if (groupSize <= promoCount) {
        alert(`每组球队数 (${groupSize} 支) 必须大于每组出线晋级名额 (${promoCount} 支)！`);
        return;
      }
    }

    // 单组循环赛防呆
    if (formatType === 'single_group' && teams.length <= promoCount) {
      alert(`球队总数 (${teams.length} 支) 必须大于出线名额 (${promoCount} 支)！`);
      return;
    }

    if (formatType === 'knockout') {
      // 1. 经典单败淘汰赛抽签
      const shuffled = [...teams].sort(() => Math.random() - 0.5);
      const matches = [];
      let index = 0;
      let matchIdCount = 1;

      while (index < shuffled.length) {
        if (index + 1 < shuffled.length) {
          matches.push({
            id: `r1_m${matchIdCount++}`,
            team1: shuffled[index],
            team2: shuffled[index + 1],
            completed: false,
            winner: null,
            score1: 0,
            score2: 0
          });
          index += 2;
        } else {
          matches.push({
            id: `r1_m${matchIdCount++}`,
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

      saveStore('tournament', {
        type: 'knockout',
        round: 1,
        activeTeams: [...teams],
        currentMatches: matches,
        history: []
      });
    } else if (formatType === 'single_group') {
      // 2. 单组循环赛抽签
      if (teams.length <= promoCount) {
        alert(`已报名球队数量（${teams.length}支）不应少于出线晋级名额（${promoCount}人），请修改名额配置！`);
        return;
      }

      const matches = generateRoundRobinMatches(teams);
      saveStore('tournament', {
        type: 'single_group',
        stage: 'group',
        promoCount,
        activeTeams: [...teams],
        currentMatches: matches,
        history: []
      });
    } else if (formatType === 'multi_group') {
      // 3. 多小组循环赛抽签
      const teamsPerGroup = teams.length / groupCount;
      if (teamsPerGroup < 2) {
        alert(`队伍太少，无法分配到 ${groupCount} 个小组内，请选择更少的小组数！`);
        return;
      }
      if (teamsPerGroup <= promoCount) {
        alert(`每个小组内的球队数不多于每组出线名额（${promoCount}人），请修改出线名额！`);
        return;
      }

      const shuffled = [...teams].sort(() => Math.random() - 0.5);
      const groups = {};
      const groupNames = groupCount === 2 ? ['A', 'B'] : ['A', 'B', 'C', 'D'];

      groupNames.forEach(name => {
        groups[name] = [];
      });

      shuffled.forEach((team, idx) => {
        const gName = groupNames[idx % groupNames.length];
        groups[gName].push(team);
      });

      const matches = [];
      groupNames.forEach(gName => {
        const gMatches = generateRoundRobinMatches(groups[gName], gName);
        matches.push(...gMatches);
      });

      saveStore('tournament', {
        type: 'multi_group',
        stage: 'group',
        groupCount,
        promoCount,
        groups,
        activeTeams: [...teams],
        currentMatches: matches,
        history: []
      });
    }
  };

  // 晋级至淘汰赛阶段
  const promoteToPlayoffs = () => {
    if (!isAdmin) {
      alert('权限不足，仅系统管理员可操作晋级！');
      return;
    }
    if (!t) return;

    if (confirm('确认小组循环赛均已结束，现在根据积分榜名次生成交叉淘汰赛对阵吗？')) {
      const nextT = generatePlayoffMatches(t);
      saveStore('tournament', nextT);
      alert('已成功晋级到淘汰赛阶段！对阵表已实时更新。');
    }
  };

  // 结束并归档赛程
  const endTournament = () => {
    if (!isAdmin) {
      alert('权限不足，仅系统管理员可执行归档！');
      return;
    }
    if (!t) return;

    if (confirm('确定要结束并归档当前的赛程吗？此操作不可撤销，结束之后可以开启一个新赛程。')) {
      const pastTournaments = store.pastTournaments || [];
      const currentT = { ...t };
      currentT.archivedAt = new Date().toLocaleString();

      if (currentT.currentMatches && currentT.currentMatches.length > 0) {
        currentT.history.push({
          round: currentT.stage === 'group' ? '小组循环赛' : `第 ${currentT.round} 轮`,
          matches: JSON.parse(JSON.stringify(currentT.currentMatches)),
          isPartial: true
        });

        currentT.currentMatches.forEach(m => {
          sendWsMessage('MATCH_END', { matchId: m.id });
        });
      }

      const updatedPast = [...pastTournaments, currentT];

      saveStore({
        pastTournaments: updatedPast,
        tournament: null
      });

      localStorage.removeItem('hoops_manager_live_match');
      localStorage.removeItem('hoops_manager_active_match_id');

      alert('当前赛程已结束并归档。您可以继续随机抽签开启新赛程！');
    }
  };

  const handleStartMatch = async (match) => {
    await loadStore();
    onStartMatch(match);
  };

  // 渲染赛制配置面板
  const renderConfigPanel = () => {
    const groupSize = formatType === 'single_group' 
      ? teams.length 
      : (formatType === 'multi_group' ? teams.length / groupCount : 99);

    return (
      <div className="format-config-card">
        <h3>🏆 开启全新赛程</h3>
        <p className="config-desc">请选择适合本次参赛队伍数的赛制，系统将自动帮您生成赛程和积分表。</p>
        
        <div className="config-form">
          <div className="config-item">
            <label>1. 选择赛制类型</label>
            <div className="format-options">
              <label className={`format-option-label ${formatType === 'knockout' ? 'active' : ''}`}>
                <input type="radio" name="formatType" value="knockout" checked={formatType === 'knockout'} onChange={() => setFormatType('knockout')} />
                <div className="option-info">
                  <span className="title">单败淘汰赛 (Knockout)</span>
                  <span className="desc">一战定生死，输球即淘汰。奇数队自动有一队轮空晋级。</span>
                </div>
              </label>

              <label className={`format-option-label ${formatType === 'single_group' ? 'active' : ''}`}>
                <input type="radio" name="formatType" value="single_group" checked={formatType === 'single_group'} onChange={() => setFormatType('single_group')} />
                <div className="option-info">
                  <span className="title">单组循环赛 (Single Round Robin)</span>
                  <span className="desc">所有队伍分在同个大组进行单循环，根据积分与净胜分进行排名并选出晋级队伍。</span>
                </div>
              </label>

              <label className={`format-option-label ${formatType === 'multi_group' ? 'active' : ''} ${!canMultiGroup ? 'disabled' : ''}`} title={!canMultiGroup ? "球队数量不能被组数整除，或队伍不足，禁用此赛制以保证公平" : ""}>
                <input type="radio" name="formatType" value="multi_group" checked={formatType === 'multi_group'} disabled={!canMultiGroup} onChange={() => setFormatType('multi_group')} />
                <div className="option-info">
                  <span className="title">多小组循环赛 (Multi-Group Round Robin)</span>
                  <span className="desc">
                    {!canMultiGroup 
                      ? `⚠️ 球队数 (${teams.length} 支) 无法在 2 或 4 个小组间等分，已禁用。` 
                      : "球队分入多个小组进行组内单循环，各组优胜者出线交叉淘汰。"}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {formatType === 'multi_group' && (
            <div className="config-item sub-config">
              <label>2. 设置小组数量</label>
              <div className="input-group">
                <select value={groupCount} onChange={(e) => setGroupCount(Number(e.target.value))}>
                  <option value={2} disabled={!canDiv2}>分 2 个小组 (A, B 组) {!canDiv2 ? `(需队伍数能被2整除，且至少4队)` : ""}</option>
                  <option value={4} disabled={!canDiv4}>分 4 个小组 (A, B, C, D 组) {!canDiv4 ? `(需队伍数能被4整除，且至少8队)` : ""}</option>
                </select>
              </div>
            </div>
          )}

          {(formatType === 'single_group' || formatType === 'multi_group') && (
            <div className="config-item sub-config">
              <label>{formatType === 'single_group' ? '2. 设置出线进入淘汰赛的名额' : '3. 设置每个小组的出线名额'}</label>
              <div className="input-group">
                <select value={promoCount} onChange={(e) => setPromoCount(Number(e.target.value))}>
                  <option value={1} disabled={groupSize <= 1}>第 1 名出线</option>
                  <option value={2} disabled={groupSize <= 2}>前 2 名出线 {groupSize <= 2 ? `(需每组至少3队)` : ""}</option>
                  {formatType === 'single_group' && <option value={4} disabled={groupSize <= 4}>前 4 名出线 {groupSize <= 4 ? `(需大组至少5队)` : ""}</option>}
                  {formatType === 'multi_group' && groupCount === 2 && <option value={3} disabled={groupSize <= 3}>前 3 名出线 {groupSize <= 3 ? `(需每组至少4队)` : ""}</option>}
                </select>
              </div>
            </div>
          )}

          <div className="config-actions">
            {isAdmin ? (
              <button className="primary-btn large-btn draw-btn" onClick={drawLots}>
                <i className="bx bx-shuffle"></i> 开启抽签并生成对阵
              </button>
            ) : (
              <p className="not-admin-notice"><i className="bx bx-info-circle"></i> 暂无活动赛程，请等待系统管理员开始抽签。</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  // 渲染比赛卡片
  const renderMatchCard = (m) => {
    const team1Class = m.winner && m.winner.id === m.team1.id ? 'winner' : '';
    const team2Class = m.winner && m.winner.id === m.team2.id ? 'winner' : '';

    return (
      <div key={m.id} className="matchup-card">
        {m.round && <div className="match-round-badge">第 {m.round} 轮</div>}
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
          <div style={{ textAlign: 'center', color: 'var(--success)', marginTop: '1rem', fontWeight: 600 }}>
            <i className="bx bx-check"></i> 已完赛
          </div>
        )}
      </div>
    );
  };

  // 渲染积分榜表格
  const renderStandingsTable = (standings, pCount) => {
    return (
      <div className="standings-table-wrapper">
        <table className="standings-table">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>排名</th>
              <th>球队</th>
              <th style={{ width: '70px' }}>已赛</th>
              <th style={{ width: '90px' }}>胜 - 负</th>
              <th style={{ width: '100px' }}>总得/失分</th>
              <th style={{ width: '80px' }}>净胜分</th>
              <th style={{ width: '80px' }}>积分</th>
              <th style={{ width: '100px' }}>出线状态</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, idx) => {
              const isPromo = idx < pCount;
              return (
                <tr key={row.teamId} className={isPromo ? 'promo-row' : ''}>
                  <td>
                    <span className={`rank-badge ${idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : ''}`}>
                      {idx + 1}
                    </span>
                  </td>
                  <td className="team-cell">{row.teamName}</td>
                  <td>{row.played}</td>
                  <td><span className="stats-w-l">{row.won}W</span> - <span className="stats-w-l lost">{row.lost}L</span></td>
                  <td>{row.scoreFor} / {row.scoreAgainst}</td>
                  <td className={row.scoreDiff > 0 ? 'diff-pos' : row.scoreDiff < 0 ? 'diff-neg' : ''}>
                    {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                  </td>
                  <td className="points-cell">{row.points}</td>
                  <td>
                    {isPromo ? (
                      <span className="promo-badge"><i className="bx bx-check-double"></i> 晋级区</span>
                    ) : (
                      <span className="elim-badge">未晋级</span>
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

  // 渲染主流程内容
  const renderContent = () => {
    // 1. 如果没有开启任何活动赛程
    if (!t) {
      return renderConfigPanel();
    }

    // 2. 如果已决出冠军 (仅限最终淘汰赛阶段)
    if (t.stage !== 'group' && t.activeTeams && t.activeTeams.length === 1) {
      return (
        <div className="empty-state" style={{ borderColor: 'var(--primary-color)' }}>
          <i className="bx bxs-trophy" style={{ color: 'var(--primary-color)', fontSize: '4rem' }}></i>
          <p style={{ fontSize: '1.5rem', color: '#fff', margin: '1rem 0', fontWeight: 800 }}>
            🏆 恭喜夺冠：{t.activeTeams[0].name}
          </p>
          <p>
            {isAdmin ? '请点击右上角按钮归档本届赛程，在历史记录中永久保存积分和对阵' : '本届赛事已圆满结束，请等待管理员归档数据。'}
          </p>
        </div>
      );
    }

    // 3. 循环赛阶段 (stage === 'group')
    if (t.stage === 'group') {
      const allMatchesCompleted = t.currentMatches && t.currentMatches.length > 0 && t.currentMatches.every(m => m.completed);

      if (t.type === 'single_group') {
        const standings = calculateStandings(t.currentMatches, t.activeTeams);
        return (
          <div className="group-stage-container">
            {isAdmin && allMatchesCompleted && (
              <div className="promote-bar">
                <div className="promote-info">
                  <i className="bx bx-info-circle"></i>
                  <span>单组循环赛已全部完成！请确认下方积分榜排名，然后点击按钮生成淘汰赛阶段对阵。</span>
                </div>
                <button className="primary-btn promote-btn" onClick={promoteToPlayoffs}>
                  <i className="bx bx-play-circle"></i> 晋级至淘汰赛阶段
                </button>
              </div>
            )}

            <div className="group-layout">
              <div className="group-standings-section">
                <h3 className="section-subtitle"><i className="bx bx-list-ol"></i> 循环赛积分榜</h3>
                {renderStandingsTable(standings, t.promoCount)}
              </div>

              <div className="group-matches-section">
                <h3 className="section-subtitle"><i className="bx bx-calendar"></i> 赛程与对阵表</h3>
                <div className="matchups-grid">
                  {t.currentMatches.map(m => renderMatchCard(m))}
                </div>
              </div>
            </div>
          </div>
        );
      } else if (t.type === 'multi_group') {
        // 多小组赛制
        const groupNames = t.groupCount === 2 ? ['A', 'B'] : ['A', 'B', 'C', 'D'];
        return (
          <div className="group-stage-container">
            {isAdmin && allMatchesCompleted && (
              <div className="promote-bar">
                <div className="promote-info">
                  <i className="bx bx-info-circle"></i>
                  <span>小组循环赛已全部完成！请确认各小组积分名次，然后点击生成交叉淘汰赛对阵。</span>
                </div>
                <button className="primary-btn promote-btn" onClick={promoteToPlayoffs}>
                  <i className="bx bx-play-circle"></i> 生成淘汰赛阶段对阵
                </button>
              </div>
            )}

            <div className="multi-group-layout">
              {groupNames.map(gName => {
                const gTeams = t.groups[gName] || [];
                const gMatches = t.currentMatches.filter(m => m.group === gName);
                const gStandings = calculateStandings(gMatches, gTeams);

                return (
                  <div key={gName} className="group-card">
                    <h3 className="group-card-title"><i className="bx bx-group"></i> {gName} 组</h3>
                    <div className="group-layout">
                      <div className="group-standings-section">
                        <h4 className="sub-table-title">组内积分榜</h4>
                        {renderStandingsTable(gStandings, t.promoCount)}
                      </div>
                      <div className="group-matches-section">
                        <h4 className="sub-table-title">组内对阵</h4>
                        <div className="matchups-grid compact-grid">
                          {gMatches.map(m => renderMatchCard(m))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
    }

    // 4. 淘汰赛阶段 (stage === 'knockout' 或默认)
    const groupHistory = t.history && t.history.find(h => h.round === '小组循环赛');
    const isEvolvedFromGroup = (t.type === 'single_group' || t.type === 'multi_group') && groupHistory;

    return (
      <div className="knockout-stage-container" style={{ width: '100%' }}>
        {isEvolvedFromGroup && (
          <div className="evolved-group-standings-section" style={{ marginBottom: '2.5rem' }}>
            <h3 
              className="section-subtitle" 
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} 
              onClick={() => setIsGroupStandingsOpen(!isGroupStandingsOpen)}
            >
              <span><i className="bx bx-list-ol"></i> 小组循环赛最终积分榜</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                {isGroupStandingsOpen ? '点击收起' : '点击展开'} <i className={`bx bx-chevron-${isGroupStandingsOpen ? 'up' : 'down'}`} style={{ verticalAlign: 'middle', fontSize: '1.1rem' }}></i>
              </span>
            </h3>
            
            {isGroupStandingsOpen && (
              <div className="standings-box" style={{ marginTop: '1rem' }}>
                {t.type === 'single_group' ? (
                  renderStandingsTable(
                    calculateStandings(groupHistory.matches, extractTeamsFromMatches(groupHistory.matches)),
                    t.promoCount
                  )
                ) : (
                  <div className={`evolved-multi-groups ${t.groupCount === 4 ? 'four-groups' : ''}`}>
                    {(t.groupCount === 2 ? ['A', 'B'] : ['A', 'B', 'C', 'D']).map(gName => {
                      const gMatches = groupHistory.matches.filter(m => m.group === gName);
                      const gTeams = extractTeamsFromMatches(gMatches);
                      const gStandings = calculateStandings(gMatches, gTeams);
                      return (
                        <div key={gName} className="group-standing-card" style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1.25rem' }}>
                          <h4 style={{ color: 'var(--primary-color)', marginBottom: '0.75rem', fontWeight: 600 }}>{gName} 组最终积分</h4>
                          {renderStandingsTable(gStandings, t.promoCount)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <h3 className="section-subtitle" style={{ marginBottom: '1.5rem' }}>
          <i className="bx bx-git-commit"></i> 淘汰赛对阵图
        </h3>
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
            return renderMatchCard(m);
          })}
        </div>
      </div>
    );
  };

  // 渲染历史已结束阶段
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
          <i className="bx bx-history"></i> 本届已结束阶段
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
              {roundData.round}
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
                    {m.round && <div className="match-round-badge">第 {m.round} 轮</div>}
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

  // 顶栏按钮与文本状态判定
  const allCompleted = t && t.currentMatches && t.currentMatches.length > 0 && t.currentMatches.every(m => m.completed);
  const isGroupStage = t && t.stage === 'group';
  
  const drawBtnText = allCompleted 
    ? (isGroupStage ? '等待晋级' : '抽取下一轮') 
    : '随机抽签';

  const showEndBtn = t && (
    (t.stage !== 'group' && t.activeTeams && t.activeTeams.length === 1) || 
    (t.currentMatches && t.currentMatches.length > 0)
  );

  return (
    <section id="tournament" className="view-section active" style={{ display: 'block' }}>
      <header className="section-header">
        <h1>抽签与对阵</h1>
        <p>支持淘汰赛、单组循环赛、多小组循环赛的生成与对阵榜管理。</p>
      </header>
      <div className="tournament-container">
        <div className="action-bar">
          <h3>
            {t ? (
              t.stage === 'group' 
                ? (t.type === 'single_group' ? '循环赛阶段' : '小组循环赛阶段')
                : (t.activeTeams && t.activeTeams.length === 1 ? `🏆 冠军诞生：${t.activeTeams[0].name}` : `淘汰赛阶段 - 第 ${t.round} 轮`)
            ) : (
              '等待开启赛程'
            )}
          </h3>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {isAdmin && t && t.stage !== 'group' && t.activeTeams && t.activeTeams.length > 1 && (
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
