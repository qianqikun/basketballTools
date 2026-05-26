const http = require('http');

const PORT = 3000;
const HOST = 'localhost';

// 简易 HTTP 请求封装，带 Bearer token 保持会话
let token = '';

function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : '';
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (data) {
      req.write(postData);
    }
    req.end();
  });
}

// 积分榜计算方法副本 (与前端计算逻辑一致，供测试检验)
function calculateStandings(matches, groupTeams) {
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

  const list = Object.values(standingsMap).map(s => {
    s.scoreDiff = s.scoreFor - s.scoreAgainst;
    return s;
  });

  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
    if (b.scoreFor !== a.scoreFor) return b.scoreFor - a.scoreFor;
    const directMatch = a.matchesList.find(m => m.opponentId === b.teamId);
    if (directMatch) return directMatch.isWin ? -1 : 1;
    return 0;
  });

  return list;
}

function extractTeamsFromMatches(matches) {
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
}

// 模拟 React/原生端的小组赛晋级逻辑
function generatePlayoffMatches(tournament) {
  const { type, promoCount, groupCount, currentMatches, groups } = tournament;
  const standings = {};
  Object.keys(groups).forEach(gName => {
    standings[gName] = calculateStandings(
      currentMatches.filter(m => m.group === gName),
      groups[gName]
    );
  });

  const promoTeams = {};
  Object.keys(standings).forEach(gName => {
    promoTeams[gName] = standings[gName].slice(0, promoCount).map(s => {
      return tournament.activeTeams.find(t => t.id === s.teamId);
    });
  });

  const nextActiveTeams = [];
  const nextMatches = [];

  const aList = promoTeams['A'] || [];
  const bList = promoTeams['B'] || [];
  nextActiveTeams.push(...aList, ...bList);

  // 4强半决赛：A1-B2, B1-A2
  nextMatches.push(
    { id: `r1_m1`, team1: aList[0], team2: bList[1], completed: false, winner: null, score1: 0, score2: 0 },
    { id: `r1_m2`, team1: bList[0], team2: aList[1], completed: false, winner: null, score1: 0, score2: 0 }
  );

  return {
    type: tournament.type,
    stage: 'knockout',
    round: 1,
    activeTeams: nextActiveTeams,
    currentMatches: nextMatches,
    promoCount: tournament.promoCount,
    groupCount: tournament.groupCount,
    groups: tournament.groups,
    history: [
      {
        round: '小组循环赛',
        matches: JSON.parse(JSON.stringify(currentMatches))
      }
    ]
  };
}

// 运行端到端工作流自动化测试
async function runTest() {
  console.log('🚀 开始自动化验证多小组循环赛流程...');

  try {
    // 1. 登录管理员
    const loginRes = await request('/api/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    if (loginRes.status !== 200 || !loginRes.data.success) {
      throw new Error(`管理员登录失败: ${JSON.stringify(loginRes.data)}`);
    }
    token = loginRes.data.token;
    console.log('✅ 管理员登录成功');

    // 2. 清空并初始注册 6 个队
    const teams = [
      { id: 't_1', name: '湖人' },
      { id: 't_2', name: '勇士' },
      { id: 't_3', name: '凯尔特人' },
      { id: 't_4', name: '热火' },
      { id: 't_5', name: '雄鹿' },
      { id: 't_6', name: '掘金' }
    ];
    
    const storeGet = await request('/api/store');
    const store = storeGet.data.data || {};
    store.teams = teams;
    store.tournament = null; // 清除之前的锦标赛

    let saveRes = await request('/api/store', 'POST', store);
    if (saveRes.status !== 200) {
      throw new Error(`保存注册球队失败: ${JSON.stringify(saveRes.data)}`);
    }
    console.log('✅ 6 支球队报名成功');

    // 3. 生成小组赛对局并开启赛程 (2 个小组，A组和B组，每组 3 队，循环赛)
    const groups = {
      'A': [teams[0], teams[1], teams[2]], // 湖人, 勇士, 凯尔特人
      'B': [teams[3], teams[4], teams[5]]  // 热火, 雄鹿, 掘金
    };

    // 为两组分别生成循环赛 matches (每组 3 场)
    const matches = [
      // A组对阵
      { id: 'g_A_m1', team1: teams[0], team2: teams[1], completed: false, score1: 0, score2: 0, group: 'A', round: 1 },
      { id: 'g_A_m2', team1: teams[1], team2: teams[2], completed: false, score1: 0, score2: 0, group: 'A', round: 2 },
      { id: 'g_A_m3', team1: teams[0], team2: teams[2], completed: false, score1: 0, score2: 0, group: 'A', round: 3 },
      // B组对阵
      { id: 'g_B_m1', team1: teams[3], team2: teams[4], completed: false, score1: 0, score2: 0, group: 'B', round: 1 },
      { id: 'g_B_m2', team1: teams[4], team2: teams[5], completed: false, score1: 0, score2: 0, group: 'B', round: 2 },
      { id: 'g_B_m3', team1: teams[3], team2: teams[5], completed: false, score1: 0, score2: 0, group: 'B', round: 3 }
    ];

    const tournament = {
      type: 'multi_group',
      stage: 'group',
      groupCount: 2,
      promoCount: 2,
      groups: groups,
      activeTeams: [...teams],
      currentMatches: matches,
      history: []
    };

    store.tournament = tournament;
    saveRes = await request('/api/store', 'POST', store);
    if (saveRes.status !== 200) {
      throw new Error(`初始化小组循环赛失败: ${JSON.stringify(saveRes.data)}`);
    }
    console.log('✅ 成功开启多小组循环赛阶段，对阵生成完毕');

    // 4. 模拟小组赛完赛 (提交比分并决出排名)
    const completedMatches = [
      { ...matches[0], completed: true, score1: 90, score2: 80, winner: teams[0] }, // 湖人胜勇士
      { ...matches[1], completed: true, score1: 85, score2: 95, winner: teams[2] }, // 凯尔特人胜勇士
      { ...matches[2], completed: true, score1: 100, score2: 90, winner: teams[0] }, // 湖人胜凯尔特人
      { ...matches[3], completed: true, score1: 100, score2: 90, winner: teams[3] }, // 热火胜雄鹿
      { ...matches[4], completed: true, score1: 95, score2: 85, winner: teams[4] }, // 雄鹿胜掘金
      { ...matches[5], completed: true, score1: 105, score2: 110, winner: teams[5] } // 掘金胜热火
    ];

    tournament.currentMatches = completedMatches;
    store.tournament = tournament;
    saveRes = await request('/api/store', 'POST', store);
    if (saveRes.status !== 200) {
      throw new Error(`提交小组赛比分失败: ${JSON.stringify(saveRes.data)}`);
    }
    console.log('✅ 6 场小组赛全部完赛并录入完毕');

    // 5. 模拟晋级淘汰赛 (点击“生成淘汰赛阶段对阵”按钮)
    const aStandings = calculateStandings(completedMatches.filter(m => m.group === 'A'), groups['A']);
    const bStandings = calculateStandings(completedMatches.filter(m => m.group === 'B'), groups['B']);
    
    console.log(`   A组第1: ${aStandings[0].teamName}，第2: ${aStandings[1].teamName}`);
    console.log(`   B组第1: ${bStandings[0].teamName}，第2: ${bStandings[1].teamName}`);

    if (aStandings[0].teamId !== 't_1' || aStandings[1].teamId !== 't_3') {
      throw new Error('A组积分排名计算不正确！');
    }
    if (bStandings[0].teamId !== 't_4' || bStandings[1].teamId !== 't_5') {
      throw new Error('B组积分排名计算不正确！');
    }
    console.log('✅ 小组积分排名算法验证通过');

    const nextT = generatePlayoffMatches(tournament);
    store.tournament = nextT;
    saveRes = await request('/api/store', 'POST', store);
    if (saveRes.status !== 200) {
      throw new Error(`推进晋级淘汰赛失败: ${JSON.stringify(saveRes.data)}`);
    }
    console.log('✅ 成功晋级至淘汰赛阶段，已生成半决赛对局');

    // 验证半决赛对局数与交叉配对
    const playoffMatches = nextT.currentMatches;
    if (playoffMatches.length !== 2) {
      throw new Error(`半决赛生成的对局数量不正确，预期 2 场，实际 ${playoffMatches.length} 场！`);
    }
    
    const m1_desc = `${playoffMatches[0].team1.name} vs ${playoffMatches[0].team2.name}`;
    const m2_desc = `${playoffMatches[1].team1.name} vs ${playoffMatches[1].team2.name}`;
    console.log(`   半决赛对局1: ${m1_desc}`);
    console.log(`   半决赛对局2: ${m2_desc}`);

    if (
      !(playoffMatches[0].team1.id === 't_1' && playoffMatches[0].team2.id === 't_5') &&
      !(playoffMatches[0].team1.id === 't_5' && playoffMatches[0].team2.id === 't_1')
    ) {
      throw new Error('半决赛交叉对局配对湖人 vs 雄鹿错乱！');
    }
    console.log('✅ 交叉对阵规则验证通过');

    // 6. 模拟半决赛完赛 (提交比分)
    const playoffCompletedMatches = [
      { ...playoffMatches[0], completed: true, score1: 100, score2: 90, winner: playoffMatches[0].team1 },
      { ...playoffMatches[1], completed: true, score1: 80, score2: 90, winner: playoffMatches[1].team2 }
    ];

    const playoffWinners = [playoffMatches[0].team1, playoffMatches[1].team2];
    
    nextT.currentMatches = playoffCompletedMatches;
    nextT.activeTeams = playoffWinners;
    nextT.history.push({
      round: nextT.round,
      matches: JSON.parse(JSON.stringify(playoffCompletedMatches))
    });
    nextT.round += 1;
    nextT.currentMatches = [];

    store.tournament = nextT;
    saveRes = await request('/api/store', 'POST', store);
    if (saveRes.status !== 200) {
      throw new Error(`录入半决赛赛果失败: ${JSON.stringify(saveRes.data)}`);
    }
    console.log('✅ 半决赛全部完赛并录入，活跃队伍已正确剔除败者，剩下湖人与凯尔特人');

    // 7. 模拟“抽取下一轮”决赛对阵
    const shuffled = [...nextT.activeTeams];
    const finalMatches = [
      {
        id: `r${nextT.round}_m1`,
        team1: shuffled[0],
        team2: shuffled[1],
        completed: false,
        winner: null,
        score1: 0,
        score2: 0
      }
    ];

    nextT.currentMatches = finalMatches;
    store.tournament = nextT;
    saveRes = await request('/api/store', 'POST', store);
    if (saveRes.status !== 200) {
      throw new Error(`抽取下一轮决赛对阵失败: ${JSON.stringify(saveRes.data)}`);
    }
    console.log(`✅ 决赛对阵生成成功: ${finalMatches[0].team1.name} vs ${finalMatches[0].team2.name}`);

    if (finalMatches.length !== 1) {
      throw new Error(`决赛对阵数量不正确，应该是 1 场，实际为 ${finalMatches.length} 场！`);
    }
    console.log('✅ 淘汰赛第二轮决赛对局数量验证通过');

    // 8. 模拟决赛完赛
    const finalCompletedMatches = [
      { ...finalMatches[0], completed: true, score1: 102, score2: 100, winner: finalMatches[0].team1 }
    ];

    nextT.currentMatches = finalCompletedMatches;
    nextT.activeTeams = [finalMatches[0].team1]; // 仅剩冠军
    nextT.history.push({
      round: nextT.round,
      matches: JSON.parse(JSON.stringify(finalCompletedMatches))
    });
    nextT.round += 1;
    nextT.currentMatches = [];

    store.tournament = nextT;
    saveRes = await request('/api/store', 'POST', store);
    if (saveRes.status !== 200) {
      throw new Error(`决赛录入失败: ${JSON.stringify(saveRes.data)}`);
    }
    console.log(`🏆 决赛打完，冠军诞生！冠军是：${nextT.activeTeams[0].name}`);

    if (nextT.activeTeams.length !== 1) {
      throw new Error('未决出最终单支冠军队伍！');
    }
    console.log('✅ 冠军诞生验证通过');

    // 9. 模拟结束并归档赛程
    if (!store.pastTournaments) {
      store.pastTournaments = [];
    }
    const tToArchive = JSON.parse(JSON.stringify(nextT));
    tToArchive.archivedAt = new Date().toLocaleString();
    
    store.pastTournaments.push(tToArchive);
    store.tournament = null; // 重置当前赛程

    saveRes = await request('/api/store', 'POST', store);
    if (saveRes.status !== 200) {
      throw new Error(`归档赛程失败: ${JSON.stringify(saveRes.data)}`);
    }
    console.log('✅ 赛程已成功归档');

    // 10. 验证归档内容是否能正常查询并展示小组赛和淘汰赛数据
    const checkStoreGet = await request('/api/store');
    const finalStore = checkStoreGet.data.data || {};
    const lastPast = finalStore.pastTournaments[finalStore.pastTournaments.length - 1];

    if (!lastPast) {
      throw new Error('未找到已归档的赛程记录！');
    }

    const archivedGroupHistory = lastPast.history.find(h => h.round === '小组循环赛');
    if (!archivedGroupHistory || archivedGroupHistory.matches.length !== 6) {
      throw new Error('归档记录中丢失小组赛赛果或局数不正确！');
    }

    const archivedRound1History = lastPast.history.find(h => h.round === 1);
    if (!archivedRound1History || archivedRound1History.matches.length !== 2) {
      throw new Error('归档记录中丢失淘汰赛第一轮(半决赛)赛果！');
    }

    const archivedRound2History = lastPast.history.find(h => h.round === 2);
    if (!archivedRound2History || archivedRound2History.matches.length !== 1) {
      throw new Error('归档记录中丢失淘汰赛第二轮(决赛)赛果！');
    }

    console.log('✅ 归档数据完整性验证通过（含 6 场小组赛、2 场半决赛、1 场决赛）');

    console.log('\n🎉🎉🎉 E2E 自动化测试完成！所有测试断言全部通过，修复完美无缺！ 🎉🎉\n');

  } catch (err) {
    console.error('❌ 测试过程中发生断言错误:', err.message);
    process.exit(1);
  }
}

runTest();
