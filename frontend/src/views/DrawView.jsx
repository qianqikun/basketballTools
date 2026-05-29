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

  // 计算净胜分并转为列表
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

// 动态字母组名生成 (例如 count=3 返回 ['A', 'B', 'C'])
const getGroupNames = (count) => {
  const names = [];
  for (let i = 0; i < count; i++) {
    names.push(String.fromCharCode(65 + i));
  }
  return names;
};

// 动态计算合法的偶数小组数量，每组至少2支队伍
const getValidEvenGroupCounts = (count) => {
  const options = [];
  const maxGroups = Math.floor(count / 2);
  for (let g = 2; g <= maxGroups; g += 2) {
    options.push(g);
  }
  return options;
};

// 3. 小组循环赛完赛后，一键生成淘汰赛对决
const generatePlayoffMatches = (tournament) => {
  const { type, promoCount, groupCount, currentMatches, groups } = tournament;

  // 1. 计算各个小组 the 最终积分榜
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
    // 多小组出线交叉淘汰：兼容任意小组数量和每组晋级人数
    
    // 1. 收集所有各小组晋级队伍，并打入最终活跃队伍列表
    const groupNames = Object.keys(promoTeams).sort(); // 按 A, B, C 字母顺序
    groupNames.forEach(gName => {
      const list = promoTeams[gName] || [];
      nextActiveTeams.push(...list);
    });

    // 2. 建立 ranks 矩阵。ranks[i] 包含了各小组的第 i+1 名
    const ranks = [];
    for (let i = 0; i < promoCount; i++) {
      const rankTeams = [];
      groupNames.forEach(gName => {
        const list = promoTeams[gName] || [];
        if (list[i]) {
          rankTeams.push(list[i]);
        }
      });
      ranks.push(rankTeams);
    }

    // 3. 对称折叠交叉配对（因为组数 M 必定是偶数，首轮参赛队数 N = M * P 也必然是偶数）
    let i = 0;
    let j = promoCount - 1;
    let mCount = 1;
    const M = groupNames.length;
    const shift = Math.floor(M / 2);

    while (i <= j) {
      if (i < j) {
        // 高顺位与低顺位交叉对决（如第一名 vs 最后一名，第 i 名层 vs 第 j 名层）
        // 结合移位 shift 避免同组
        for (let k = 0; k < M; k++) {
          const t1 = ranks[i][k];
          const t2 = ranks[j][(k + shift) % M];
          if (t1 && t2) {
            nextMatches.push({
              id: `r1_m${mCount++}`,
              team1: t1,
              team2: t2,
              completed: false,
              winner: null,
              score1: 0,
              score2: 0
            });
          }
        }
      } else {
        // 当 promoCount 是奇数时，剩下一层最中间的名次（i === j）
        const midList = ranks[i];
        // 对 midList 内部进行前半段 vs 后半段交叉碰，彻底避免同组
        for (let k = 0; k < shift; k++) {
          const t1 = midList[k];
          const t2 = midList[k + shift];
          if (t1 && t2) {
            nextMatches.push({
              id: `r1_m${mCount++}`,
              team1: t1,
              team2: t2,
              completed: false,
              winner: null,
              score1: 0,
              score2: 0
            });
          }
        }
      }
      i++;
      j--;
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
  const tournaments = store.tournaments || [];
  const [activeTourId, setActiveTourId] = useState('');
  const t = tournaments.find(tour => tour.id === activeTourId) || null;
  const isAdmin = currentUser && currentUser.role === 'admin';

  // 赛制配置面板状态
  const [formatType, setFormatType] = useState('knockout'); // 'knockout' | 'single_group' | 'multi_group'
  const [groupCount, setGroupCount] = useState(2); // 2 | 4
  const [promoCount, setPromoCount] = useState(2); // 1 | 2 | 3
  const [isGroupStandingsOpen, setIsGroupStandingsOpen] = useState(true); // 淘汰赛阶段控制循环赛积分榜展开/收起

  // 开启新赛程面板状态
  const [newTourName, setNewTourName] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);

  // 计算合法均分的可选状态
  const selectedCount = selectedTeamIds.length;
  const validGroupCounts = getValidEvenGroupCounts(selectedCount);
  const canMultiGroup = validGroupCounts.length > 0;

  // 当赛程数组改变时，校准选中的当前赛程
  useEffect(() => {
    if (tournaments.length > 0) {
      if (!activeTourId || (!tournaments.some(tour => tour.id === activeTourId) && activeTourId !== 'create_new')) {
        setActiveTourId(tournaments[0].id);
      }
    } else {
      setActiveTourId('create_new');
    }
  }, [tournaments, activeTourId]);

  // 1. 当勾选队伍总数变动，导致当前选中的多小组循环赛不合法时，自动回退到淘汰赛
  useEffect(() => {
    if (formatType === 'multi_group' && !canMultiGroup) {
      setFormatType('knockout');
    }
  }, [selectedCount, formatType, canMultiGroup]);

  // 2. 当选中多小组循环赛时，若选中的小组数在当前人数下非法，自动重置为第一个合法的小组数
  useEffect(() => {
    if (formatType === 'multi_group') {
      if (!validGroupCounts.includes(groupCount)) {
        setGroupCount(validGroupCounts[0] || 2);
      }
    }
  }, [formatType, groupCount, selectedCount, validGroupCounts]);

  // 3. 当晋级人数超过最小小组人数上限时，自动调降晋级名额数
  useEffect(() => {
    const minGroupSize = formatType === 'single_group' 
      ? selectedCount 
      : (formatType === 'multi_group' ? Math.floor(selectedCount / groupCount) : 99);
    
    const maxPromo = minGroupSize - 1;
    if (promoCount > maxPromo && maxPromo >= 1) {
      setPromoCount(Math.max(1, Math.floor(maxPromo)));
    }
  }, [formatType, groupCount, selectedCount, promoCount]);

  const handleSelectAllTeams = () => {
    setSelectedTeamIds(teams.map(team => team.id));
  };
  const handleDeselectAllTeams = () => {
    setSelectedTeamIds([]);
  };
  const handleToggleTeamSelection = (teamId) => {
    setSelectedTeamIds(prev => 
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    );
  };

  // 创建并开启新赛程的抽签逻辑
  const drawLots = () => {
    if (!isAdmin) {
      alert('权限不足，仅系统管理员可执行抽签！');
      return;
    }

    if (!newTourName.trim()) {
      alert('请输入新赛程的名称！');
      return;
    }

    const selectedTeams = teams.filter(t => selectedTeamIds.includes(t.id));
    if (selectedTeams.length < 2) {
      alert('至少需要勾选 2 支队伍才能开启抽签对阵！');
      return;
    }

    // 多小组循环赛防呆校验
    if (formatType === 'multi_group') {
      if (!canMultiGroup) {
        alert('当前勾选的队伍数量过少，无法进行多小组循环赛！');
        return;
      }
      const validCounts = getValidEvenGroupCounts(selectedTeams.length);
      if (!validCounts.includes(groupCount)) {
        alert(`当前勾选的队伍数 (${selectedTeams.length} 支) 无法分为 ${groupCount} 个小组！`);
        return;
      }

      const minGroupSize = Math.floor(selectedTeams.length / groupCount);
      if (minGroupSize <= promoCount) {
        alert(`人数最少的小组球队数 (${minGroupSize} 支) 必须大于每组出线晋级名额 (${promoCount} 支)！`);
        return;
      }
    }

    // 单组循环赛防呆
    if (formatType === 'single_group' && selectedTeams.length <= promoCount) {
      alert(`勾选的球队总数 (${selectedTeams.length} 支) 必须大于出线名额 (${promoCount} 支)！`);
      return;
    }

    const newTourId = `tour_${Date.now()}`;
    let matches = [];
    let groups = null;

    if (formatType === 'knockout') {
      // 1. 经典单败淘汰赛抽签
      const shuffled = [...selectedTeams].sort(() => Math.random() - 0.5);
      let index = 0;
      let matchIdCount = 1;

      while (index < shuffled.length) {
        if (index + 1 < shuffled.length) {
          matches.push({
            id: `${newTourId}_r1_m${matchIdCount++}`,
            team1: shuffled[index],
            team2: shuffled[index + 1],
            completed: false,
            winner: null,
            score1: 0,
            score2: 0,
            tournamentId: newTourId,
            tournamentName: newTourName.trim()
          });
          index += 2;
        } else {
          matches.push({
            id: `${newTourId}_r1_m${matchIdCount++}`,
            team1: shuffled[index],
            team2: null,
            completed: true,
            winner: shuffled[index],
            score1: 0,
            score2: 0,
            isBye: true,
            tournamentId: newTourId,
            tournamentName: newTourName.trim()
          });
          index++;
        }
      }
    } else if (formatType === 'single_group') {
      // 2. 单组循环赛抽签
      const matchesRaw = generateRoundRobinMatches(selectedTeams);
      matches = matchesRaw.map(m => ({
        ...m,
        id: `${newTourId}_${m.id}`,
        tournamentId: newTourId,
        tournamentName: newTourName.trim()
      }));
    } else if (formatType === 'multi_group') {
      // 3. 多小组循环赛抽签
      const shuffled = [...selectedTeams].sort(() => Math.random() - 0.5);
      groups = {};
      const groupNames = getGroupNames(groupCount);

      groupNames.forEach(name => {
        groups[name] = [];
      });

      shuffled.forEach((team, idx) => {
        const gName = groupNames[idx % groupNames.length];
        groups[gName].push(team);
      });

      groupNames.forEach(gName => {
        const gMatches = generateRoundRobinMatches(groups[gName], gName);
        const mappedMatches = gMatches.map(m => ({
          ...m,
          id: `${newTourId}_${m.id}`,
          tournamentId: newTourId,
          tournamentName: newTourName.trim()
        }));
        matches.push(...mappedMatches);
      });
    }

    const newTournament = {
      id: newTourId,
      name: newTourName.trim(),
      type: formatType,
      stage: formatType === 'knockout' ? 'knockout' : 'group',
      round: 1,
      promoCount: formatType === 'knockout' ? 0 : promoCount,
      groupCount: formatType === 'multi_group' ? groupCount : 0,
      groups,
      activeTeams: [...selectedTeams],
      currentMatches: matches,
      history: []
    };

    const updatedTournaments = [...tournaments, newTournament];
    saveStore({ tournaments: updatedTournaments });
    
    // 重置面板并切换视图
    setNewTourName('');
    setSelectedTeamIds([]);
    setActiveTourId(newTourId);
    alert(`🎉 成功开启并生成新赛程：“${newTournament.name}”！`);
  };

  // 进行中赛程的淘汰赛下一轮抽签
  const drawNextRound = () => {
    if (!isAdmin) {
      alert('权限不足，仅系统管理员可执行抽签！');
      return;
    }
    if (!t || t.stage === 'group') return;

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

    const shuffled = [...t.activeTeams].sort(() => Math.random() - 0.5);
    const matches = [];
    let index = 0;
    let matchIdCount = 1;
    const nextRound = t.round + 1;

    while (index < shuffled.length) {
      if (index + 1 < shuffled.length) {
        matches.push({
          id: `${t.id}_r${nextRound}_m${matchIdCount++}`,
          team1: shuffled[index],
          team2: shuffled[index + 1],
          completed: false,
          winner: null,
          score1: 0,
          score2: 0,
          tournamentId: t.id,
          tournamentName: t.name
        });
        index += 2;
      } else {
        matches.push({
          id: `${t.id}_r${nextRound}_m${matchIdCount++}`,
          team1: shuffled[index],
          team2: null,
          completed: true,
          winner: shuffled[index],
          score1: 0,
          score2: 0,
          isBye: true,
          tournamentId: t.id,
          tournamentName: t.name
        });
        index++;
      }
    }

    const updatedT = {
      ...t,
      round: nextRound,
      currentMatches: matches
    };

    const updatedTournaments = tournaments.map(tour => tour.id === t.id ? updatedT : tour);
    saveStore({ tournaments: updatedTournaments });
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
      const updatedTournaments = tournaments.map(tour => tour.id === t.id ? nextT : tour);
      saveStore({ tournaments: updatedTournaments });
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

    if (confirm(`确定要结束并归档当前的赛程“${t.name}”吗？此操作不可撤销，结束之后可以开启一个新赛程。`)) {
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
      const updatedTournaments = tournaments.filter(tour => tour.id !== t.id);

      saveStore({
        pastTournaments: updatedPast,
        tournaments: updatedTournaments
      });

      const liveActiveMatchId = localStorage.getItem('hoops_manager_active_match_id');
      if (liveActiveMatchId && liveActiveMatchId.startsWith(t.id)) {
        localStorage.removeItem('hoops_manager_live_match');
        localStorage.removeItem('hoops_manager_active_match_id');
      }

      alert('当前赛程已结束并归档。您可以继续随机抽签开启新赛程！');
    }
  };

  const handleStartMatch = async (match) => {
    if (!currentUser) {
      alert('❌ 游客无法控制比赛，请先登录账号！');
      return;
    }
    await loadStore();
    onStartMatch(match);
  };

  // 渲染当前赛程切换选择器
  const renderTournamentSelector = () => {
    return (
      <div className="tournament-selector-bar" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}><i className="bx bx-select-multiple"></i> 选择当前活动赛程：</span>
        <select 
          value={activeTourId} 
          onChange={(e) => setActiveTourId(e.target.value)}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', color: '#fff', fontSize: '0.9rem', cursor: 'pointer', outline: 'none' }}
        >
          {tournaments.map(tour => (
            <option key={tour.id} value={tour.id}>
              🏆 {tour.name} ({tour.stage === 'group' ? '小组赛' : `淘汰赛第 ${tour.round} 轮`})
            </option>
          ))}
          <option value="create_new">➕ 开启新赛程...</option>
        </select>
      </div>
    );
  };

  // 渲染赛制配置面板（开启新赛程）
  const renderConfigPanel = () => {
    const selectedCount = selectedTeamIds.length;
    const groupSize = formatType === 'single_group' 
      ? selectedCount 
      : (formatType === 'multi_group' ? Math.floor(selectedCount / groupCount) : 99);

    return (
      <div className="format-config-card">
        <h3>🏆 开启全新赛程</h3>
        <p className="config-desc">请选择适合本次参赛队伍数的赛制，系统将自动帮您生成赛程和积分表。</p>
        
        <div className="config-form">
          <div className="config-item">
            <label>1. 输入新赛程名称</label>
            <div className="input-group">
              <input 
                type="text" 
                placeholder="例如：第一届巅峰杯、2026年夏季联赛" 
                value={newTourName} 
                onChange={(e) => setNewTourName(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', color: '#fff' }}
              />
            </div>
          </div>

          <div className="config-item">
            <label>2. 勾选参赛球队 (已选 {selectedCount} 支)</label>
            <div className="team-select-wrapper" style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0.75rem', background: 'rgba(0, 0, 0, 0.2)', marginBottom: '0.5rem' }}>
              {teams.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.85rem' }}>暂无球队，请先前往“球队管理”页面登记球队！</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
                  {teams.map(team => (
                    <label key={team.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#fff', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedTeamIds.includes(team.id)} 
                        onChange={() => handleToggleTeamSelection(team.id)} 
                      />
                      <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{team.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {teams.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <button type="button" className="primary-btn" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', width: 'auto' }} onClick={handleSelectAllTeams}>全选</button>
                <button type="button" className="danger-btn" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', width: 'auto' }} onClick={handleDeselectAllTeams}>清空</button>
              </div>
            )}
          </div>

          <div className="config-item">
            <label>3. 选择赛制类型</label>
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

              <label className={`format-option-label ${formatType === 'multi_group' ? 'active' : ''} ${!canMultiGroup ? 'disabled' : ''}`} title={!canMultiGroup ? "选择的球队数过少，无法进行多小组循环赛" : ""}>
                <input type="radio" name="formatType" value="multi_group" checked={formatType === 'multi_group'} disabled={!canMultiGroup} onChange={() => setFormatType('multi_group')} />
                <div className="option-info">
                  <span className="title">多小组循环赛 (Multi-Group Round Robin)</span>
                  <span className="desc">
                    {!canMultiGroup 
                      ? `⚠️ 已选队伍 (${selectedCount} 支) 过少，无法进行多小组循环赛（至少需要 4 支队伍）。` 
                      : "球队分入多个小组进行组内单循环，各组优胜者出线交叉淘汰。"}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {formatType === 'multi_group' && (
            <div className="config-item sub-config">
              <label>4. 设置小组数量</label>
              <div className="input-group">
                <select value={groupCount} onChange={(e) => setGroupCount(Number(e.target.value))}>
                  {validGroupCounts.map(count => (
                    <option key={count} value={count}>
                      分 {count} 个小组 ({getGroupNames(count).join(', ')} 组)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {(formatType === 'single_group' || formatType === 'multi_group') && (() => {
            const minGroupSize = formatType === 'single_group' 
              ? selectedCount 
              : Math.floor(selectedCount / groupCount);
            const maxPromo = Math.max(1, minGroupSize - 1);
            const promoOptions = [];
            for (let p = 1; p <= maxPromo; p++) {
              promoOptions.push(p);
            }
            return (
              <div className="config-item sub-config">
                <label>{formatType === 'single_group' ? '5. 设置出线进入淘汰赛的名额' : '5. 设置每个小组的出线名额'}</label>
                <div className="input-group">
                  <select value={promoCount} onChange={(e) => setPromoCount(Number(e.target.value))}>
                    {promoOptions.map(p => (
                      <option key={p} value={p}>
                        {p === 1 ? '第 1 名出线' : `前 ${p} 名出线`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })()}

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
                  <td>{row.won}W - {row.lost}L</td>
                  <td>{row.scoreFor} / {row.scoreAgainst}</td>
                  <td className={row.scoreDiff > 0 ? 'win-diff' : row.scoreDiff < 0 ? 'lose-diff' : ''}>
                    {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                  </td>
                  <td className="points-cell">{row.points}</td>
                  <td>
                    {isPromo ? (
                      <span className="promo-status-badge"><i className="bx bx-check-circle"></i> 晋级</span>
                    ) : (
                      <span className="eliminated-status-badge">未出线</span>
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

  const renderContent = () => {
    if (activeTourId === 'create_new' || !t) {
      return renderConfigPanel();
    }

    const allMatchesCompleted = t.currentMatches && t.currentMatches.length > 0 && t.currentMatches.every(m => m.completed);

    if (t.stage === 'group') {
      if (t.type === 'single_group') {
        const standings = calculateStandings(t.currentMatches, t.activeTeams);
        return (
          <div className="group-stage-container">
            {isAdmin && allMatchesCompleted && (
              <div className="promote-bar">
                <div className="promote-info">
                  <i className="bx bx-info-circle"></i>
                  <span>“{t.name}”循环赛积分已完成！请确认晋级名次后点击生成交叉淘汰赛。</span>
                </div>
                <button className="primary-btn promote-btn" onClick={promoteToPlayoffs}>
                  <i className="bx bx-play-circle"></i> 生成淘汰赛阶段对阵
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
        const groupNames = getGroupNames(t.groupCount);
        return (
          <div className="group-stage-container">
            {isAdmin && allMatchesCompleted && (
              <div className="promote-bar">
                <div className="promote-info">
                  <i className="bx bx-info-circle"></i>
                  <span>“{t.name}”小组循环赛已全部完成！请确认各小组积分名次，然后点击生成交叉淘汰赛对阵。</span>
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
                    {getGroupNames(t.groupCount).map(gName => {
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
        {renderTournamentSelector()}

        <div className="action-bar">
          <h3>
            {t ? (
              `${t.name} - ${
                t.stage === 'group' 
                  ? (t.type === 'single_group' ? '循环赛阶段' : '小组循环赛阶段')
                  : (t.activeTeams && t.activeTeams.length === 1 ? `🏆 冠军诞生：${t.activeTeams[0].name}` : `淘汰赛阶段 - 第 ${t.round} 轮`)
              }`
            ) : (
              '等待开启赛程'
            )}
          </h3>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {isAdmin && t && t.stage !== 'group' && t.activeTeams && t.activeTeams.length > 1 && (
              <button
                id="draw-lots-btn"
                className="primary-btn"
                onClick={drawNextRound}
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
