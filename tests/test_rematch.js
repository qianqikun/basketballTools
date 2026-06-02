const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

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

async function runTest() {
  console.log('🚀 开始自动化验证管理员整届重赛与非管理员拦截功能...');

  try {
    // 1. 登录管理员
    const loginRes = await request('/api/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    if (loginRes.status !== 200 || !loginRes.data.success) {
      throw new Error(`管理员登录失败: ${JSON.stringify(loginRes.data)}`);
    }
    token = loginRes.data.token;
    console.log('✅ 管理员登录成功');

    // 2. 获取原始数据，备份
    const getRes = await request('/api/store', 'GET');
    if (getRes.status !== 200 || !getRes.data.success) {
      throw new Error(`获取数据失败: ${JSON.stringify(getRes.data)}`);
    }
    const originalStore = getRes.data.data;
    console.log('✅ 成功读取当前应用数据');

    // 3. 构造一个包含淘汰赛且打完一轮被归档到 history 里的模拟赛程
    const mockTournament = {
      id: "tour_test_rematch",
      name: "整届重赛测试赛程",
      type: "multi_group",
      stage: "knockout",
      round: 2,
      activeTeams: [
        { id: "team_1", name: "队伍一" },
        { id: "team_2", name: "队伍二" }
      ],
      currentMatches: [], // 淘汰赛已打完，当前为空，准备下一轮
      promoCount: 2,
      groupCount: 2,
      groups: {
        A: [{ id: "team_1", name: "队伍一" }, { id: "team_3", name: "队伍三" }],
        B: [{ id: "team_2", name: "队伍二" }, { id: "team_4", name: "队伍四" }]
      },
      history: [
        {
          round: "小组循环赛",
          matches: [
            {
              id: "test_g_1",
              team1: { id: "team_1", name: "队伍一" },
              team2: { id: "team_3", name: "队伍三" },
              completed: true,
              winner: { id: "team_1", name: "队伍一" },
              score1: 15,
              score2: 10,
              group: "A"
            },
            {
              id: "test_g_2",
              team1: { id: "team_2", name: "队伍二" },
              team2: { id: "team_4", name: "队伍四" },
              completed: true,
              winner: { id: "team_2", name: "队伍二" },
              score1: 15,
              score2: 8,
              group: "B"
            }
          ]
        },
        {
          round: 1, // 淘汰赛第一轮
          matches: [
            {
              id: "test_r1_m1",
              team1: { id: "team_1", name: "队伍一" },
              team2: { id: "team_2", name: "队伍二" },
              completed: true,
              winner: { id: "team_1", name: "队伍一" },
              score1: 21,
              score2: 18
            }
          ]
        }
      ]
    };

    // 把模拟赛程加入到 tournaments 列表
    const testStore = {
      ...originalStore,
      tournaments: [mockTournament, ...(originalStore.tournaments || [])]
    };

    // 保存模拟赛程
    const saveRes = await request('/api/store', 'POST', testStore);
    if (saveRes.status !== 200 || !saveRes.data.success) {
      throw new Error(`管理员保存模拟赛程失败: ${JSON.stringify(saveRes.data)}`);
    }
    console.log('✅ 管理员成功注入模拟赛程数据');

    // 4. 模拟前端发起对该赛程的“整届重赛”修改
    // 逻辑：将第一个 history (小组赛阶段) 恢复为 currentMatches，将所有比赛清零且 completed = false，stage 设为 group，round = 1，history 设为 []，还原 activeTeams
    const initialGroupMatches = mockTournament.history[0].matches.map(m => ({
      ...m,
      completed: false,
      winner: null,
      score1: 0,
      score2: 0
    }));

    // 还原所有初始球队
    let restoredActiveTeams = [];
    Object.values(mockTournament.groups).forEach(list => {
      list.forEach(t => {
        if (!restoredActiveTeams.some(x => x.id === t.id)) restoredActiveTeams.push(t);
      });
    });

    const updatedTour = {
      ...mockTournament,
      stage: 'group',
      round: 1,
      activeTeams: restoredActiveTeams,
      currentMatches: initialGroupMatches,
      history: []
    };

    const rematchStore = {
      ...originalStore,
      tournaments: [updatedTour, ...(originalStore.tournaments || [])]
    };

    // 管理员执行重置赛程保存
    const adminRematchRes = await request('/api/store', 'POST', rematchStore);
    if (adminRematchRes.status !== 200 || !adminRematchRes.data.success) {
      throw new Error(`管理员发起整届重赛保存失败: ${JSON.stringify(adminRematchRes.data)}`);
    }
    console.log('✅ 管理员整届重赛接口保存成功 (预期内放行)');

    // 从服务端拉取最新数据，检验回滚状态是否正确
    const verifyGetRes = await request('/api/store', 'GET');
    const verifyTour = verifyGetRes.data.data.tournaments.find(t => t.id === mockTournament.id);
    if (!verifyTour) {
      throw new Error(`未找到注入的赛程`);
    }

    if (verifyTour.stage !== 'group') {
      throw new Error(`重置后赛程阶段未变回 group，当前为: ${verifyTour.stage}`);
    }
    if (verifyTour.round !== 1) {
      throw new Error(`重置后轮次未变回 1`);
    }
    if (verifyTour.currentMatches.length !== 2) {
      throw new Error(`恢复的小组赛比赛数量不正确，当前为: ${verifyTour.currentMatches.length}`);
    }
    if (verifyTour.currentMatches.some(m => m.completed === true || m.score1 !== 0 || m.winner !== null)) {
      throw new Error(`回滚后小组循环赛比赛的完赛状态、比分或胜者未被清空`);
    }
    if (verifyTour.history.length !== 0) {
      throw new Error(`历史记录未完全清空`);
    }
    if (verifyTour.activeTeams.length !== 4) {
      throw new Error(`活跃球队未被恢复为最初的全部球队（应为4个），当前为: ${verifyTour.activeTeams.length}`);
    }
    console.log('✅ 数据库中状态已完美回滚到初始小组赛起点，测试校验全部通过');

    // 5. 测试非管理员账号权限拦截
    console.log('🔐 开始验证非管理员用户的越权整置拦截...');
    
    // 注册一个新的普通裁判/球员账号 (使用随机用户名防冲突)
    const randomUser = 'ref_' + Math.random().toString(36).substr(2, 6);
    const registerRes = await request('/api/auth/register', 'POST', {
      username: randomUser,
      nickname: '测试裁判',
      password: 'password123',
      confirmPassword: 'password123'
    });
    if (registerRes.status === 200) {
      console.log('✅ 成功注册测试裁判账号: ' + randomUser);
    } else {
      throw new Error(`注册测试账号失败: ${JSON.stringify(registerRes.data)}`);
    }

    // 普通裁判登录
    const refereeLoginRes = await request('/api/auth/login', 'POST', {
      username: randomUser,
      password: 'password123'
    });
    if (refereeLoginRes.status !== 200 || !refereeLoginRes.data.success) {
      throw new Error(`普通裁判登录失败`);
    }
    token = refereeLoginRes.data.token;
    console.log('✅ 普通裁判登录成功');

    // 此时数据库的数据是“未完赛的小组赛”。我们先尝试让普通裁判录入其中一场完赛（这是被允许的）
    const completedTour = {
      ...updatedTour,
      currentMatches: [
        {
          ...initialGroupMatches[0],
          completed: true,
          winner: { id: "team_1", name: "队伍一" },
          score1: 15,
          score2: 12
        },
        initialGroupMatches[1]
      ]
    };
    const refereeSaveStore = {
      ...originalStore,
      tournaments: [completedTour, ...(originalStore.tournaments || [])]
    };

    const refereeSaveRes = await request('/api/store', 'POST', refereeSaveStore);
    if (refereeSaveRes.status !== 200 || !refereeSaveRes.data.success) {
      throw new Error(`普通裁判录入完赛比分失败 (本应允许): ${JSON.stringify(refereeSaveRes.data)}`);
    }
    console.log('✅ 普通裁判成功录入一场小组赛完赛比分');

    // 现在，普通裁判尝试发送修改，把已完赛的比赛重新修改回“未完赛”状态（发起重赛）
    const cheatTour = {
      ...completedTour,
      currentMatches: [
        {
          ...completedTour.currentMatches[0],
          completed: false, // 越权篡改回未完赛
          score1: 0,
          score2: 0,
          winner: null
        },
        completedTour.currentMatches[1]
      ]
    };
    const cheatStore = {
      ...originalStore,
      tournaments: [cheatTour, ...(originalStore.tournaments || [])]
    };

    console.log('🚨 正在模拟普通裁判越权调用 POST /api/store 发起重赛/重置操作...');
    const cheatRes = await request('/api/store', 'POST', cheatStore);
    
    if (cheatRes.status === 403) {
      console.log(`✅ 后端安全网成功拦截越权修改！状态码: 403 Forbidden, 拦截原因: "${cheatRes.data.error}"`);
    } else {
      throw new Error(`❌ 安全漏洞：后端未拦截普通裁判的重算/重赛操作！状态码: ${cheatRes.status}, 返回内容: ${JSON.stringify(cheatRes.data)}`);
    }

    // 6. 恢复原始数据以保持环境干净
    console.log('🧹 正在恢复原始数据库，清理测试赛程数据...');
    const adminLoginRes2 = await request('/api/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    token = adminLoginRes2.data.token;
    const cleanRes = await request('/api/store', 'POST', originalStore);
    if (cleanRes.status !== 200 || !cleanRes.data.success) {
      throw new Error(`恢复原始数据库数据失败: ${JSON.stringify(cleanRes.data)}`);
    }
    console.log('✅ 数据库现场已恢复干净');

    console.log('\n🎉 所有整届重赛回滚逻辑及管理员权限隔离安全测试全部通过！');

  } catch (err) {
    console.error('❌ 测试执行过程中发生错误:', err);
    process.exit(1);
  }
}

runTest();
