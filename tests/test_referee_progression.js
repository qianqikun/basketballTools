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
  console.log('🚀 开始自动化验证普通裁判完赛自动推进机制...');

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

    // 3. 构造一个半决赛的模拟赛程（其中第一局已完赛，第二局未完赛）
    const mockTournament = {
      id: "tour_test_progression",
      name: "裁判完赛测试赛程",
      type: "multi_group",
      stage: "knockout",
      round: 1,
      activeTeams: [
        { id: "team_1", name: "队伍一" },
        { id: "team_2", name: "队伍二" },
        { id: "team_3", name: "队伍三" },
        { id: "team_4", name: "队伍四" }
      ],
      currentMatches: [
        {
          id: "m_semi_1",
          team1: { id: "team_1", name: "队伍一" },
          team2: { id: "team_2", name: "队伍二" },
          completed: true,
          winner: { id: "team_1", name: "队伍一" },
          score1: 15,
          score2: 10
        },
        {
          id: "m_semi_2",
          team1: { id: "team_3", name: "队伍三" },
          team2: { id: "team_4", name: "队伍四" },
          completed: false,
          winner: null,
          score1: 0,
          score2: 0
        }
      ],
      promoCount: 2,
      groupCount: 2,
      groups: {
        A: [{ id: "team_1", name: "队伍一" }, { id: "team_2", name: "队伍二" }],
        B: [{ id: "team_3", name: "队伍三" }, { id: "team_4", name: "队伍四" }]
      },
      history: []
    };

    // 💡 构造一个不为空的历史归档数据，测试在这种情况下裁判是否会被 pastTournaments 校验错误拦截，
    // 以及在保存后，是否发生了历史归档数据被覆盖丢失的 Bug。
    const mockPastTournament = {
      id: "tour_old_archive",
      name: "往届归档历史赛程",
      type: "knockout",
      stage: "knockout",
      round: 1,
      activeTeams: [],
      currentMatches: [],
      history: []
    };

    // 把模拟赛程和模拟历史归档加入到 testStore
    const testStore = {
      ...originalStore,
      tournaments: [mockTournament, ...(originalStore.tournaments || [])],
      pastTournaments: [mockPastTournament]
    };

    // 保存模拟赛程
    const saveRes = await request('/api/store', 'POST', testStore);
    if (saveRes.status !== 200 || !saveRes.data.success) {
      throw new Error(`管理员保存模拟赛程失败: ${JSON.stringify(saveRes.data)}`);
    }
    console.log('✅ 管理员成功注入模拟半决赛数据');

    // 4. 注册普通裁判账号
    const randomUser = 'ref_prog_' + Math.random().toString(36).substr(2, 6);
    const registerRes = await request('/api/auth/register', 'POST', {
      username: randomUser,
      nickname: '测试裁判_自动推进',
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

    // 5. 模拟裁判在前端提交第二场半决赛完赛。
    // 这将导致：
    // - 比赛2 完赛 (completed = true, score1 = 12, score2 = 15, winner = team_4)
    // - 因为所有比赛均完赛，轮次 round 增加到 2
    // - currentMatches 置空 []
    // - 历史记录 history 增加刚才这一轮的全部比赛
    // - 活跃队伍 activeTeams 过滤为 [team_1, team_4] (只剩下两个胜者)
    const updatedTour = {
      ...mockTournament,
      round: 2,
      activeTeams: [
        { id: "team_1", name: "队伍一" },
        { id: "team_4", name: "队伍四" }
      ],
      currentMatches: [],
      history: [
        {
          round: 1,
          matches: [
            {
              id: "m_semi_1",
              team1: { id: "team_1", name: "队伍一" },
              team2: { id: "team_2", name: "队伍二" },
              completed: true,
              winner: { id: "team_1", name: "队伍一" },
              score1: 15,
              score2: 10
            },
            {
              id: "m_semi_2",
              team1: { id: "team_3", name: "队伍三" },
              team2: { id: "team_4", name: "队伍四" },
              completed: true,
              winner: { id: "team_4", name: "队伍四" },
              score1: 12,
              score2: 15
            }
          ]
        }
      ]
    };

    const refereeSaveStore = {
      ...originalStore,
      tournaments: [updatedTour, ...(originalStore.tournaments || [])],
      pastTournaments: [] // 模拟前端未加载冷数据，发送空数组
    };

    console.log('📝 正在模拟普通裁判提交最后一场半决赛比分，期望自动推进轮次...');
    const refereeSaveRes = await request('/api/store', 'POST', refereeSaveStore);
    
    // 如果还没修复，这里应该会返回 403 并报错
    console.log(`📡 返回状态码: ${refereeSaveRes.status}`);
    if (refereeSaveRes.status === 200) {
      console.log('✅ 普通裁判成功通过自动推进校验并保存数据！');
    } else {
      console.log(`❌ 裁判提交失败，返回错误: "${refereeSaveRes.data.error}"`);
    }

    // 验证历史归档是否被裁判提交的 [] 覆盖导致丢失
    const checkPastRes = await request('/api/past-tournaments', 'GET');
    if (checkPastRes.status !== 200 || !checkPastRes.data.success) {
      throw new Error('无法加载历史归档');
    }
    const currentPastList = checkPastRes.data.data || [];
    const isPastExist = currentPastList.some(p => p.id === 'tour_old_archive');
    if (!isPastExist) {
      throw new Error('❌ 严重数据丢失Bug：普通账号未带 pastTournaments 保存导致数据库中已存在的历史归档丢失！');
    }
    console.log('✅ 完美防御：数据库中的历史归档数据未发生覆盖丢失！');

    // 6. 清理现场
    console.log('🧹 正在恢复原始数据库，清理测试数据...');
    const adminLoginRes2 = await request('/api/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    token = adminLoginRes2.data.token;
    const cleanRes = await request('/api/store', 'POST', originalStore);
    if (cleanRes.status !== 200 || !cleanRes.data.success) {
      throw new Error(`恢复原始数据库数据失败: ${JSON.stringify(cleanRes.data)}`);
    }
    console.log('✅ 数据库现场已恢复干净');

    if (refereeSaveRes.status !== 200) {
      throw new Error('测试未通过：普通裁判的正常推进请求被拦截！');
    }

    // 6. 安全性检验：测试恶意裁判的越权篡改行为
    console.log('🔐 开始验证普通裁判的越权篡改动作是否能被成功拦截...');
    
    // (a) 普通裁判恶意直接将 round 推进到 3 (恶意跳轮次)
    const maliciousRoundTour = {
      ...updatedTour,
      round: 3 // 从 2 篡改为 3
    };
    const maliciousRoundStore = {
      ...originalStore,
      tournaments: [maliciousRoundTour, ...(originalStore.tournaments || [])]
    };
    token = refereeLoginRes.data.token; // 切回裁判 Token
    const maliciousRoundRes = await request('/api/store', 'POST', maliciousRoundStore);
    if (maliciousRoundRes.status === 403) {
      console.log('✅ 成功拦截裁判篡改轮次操作 (403)');
    } else {
      throw new Error(`安全漏洞：后端未能拦截普通裁判篡改轮次的操作，状态码: ${maliciousRoundRes.status}`);
    }

    // (b) 普通裁判恶意篡改历史已完赛比赛的比分 (篡改历史记录)
    const maliciousHistoryTour = JSON.parse(JSON.stringify(updatedTour));
    maliciousHistoryTour.history[0].matches[0].score1 = 99; // 把原本 15 比分篡改为 99
    const maliciousHistoryStore = {
      ...originalStore,
      tournaments: [maliciousHistoryTour, ...(originalStore.tournaments || [])]
    };
    const maliciousHistoryRes = await request('/api/store', 'POST', maliciousHistoryStore);
    if (maliciousHistoryRes.status === 403) {
      console.log('✅ 成功拦截裁判篡改历史比分操作 (403)');
    } else {
      throw new Error(`安全漏洞：后端未能拦截普通裁判篡改历史记录的操作，状态码: ${maliciousHistoryRes.status}`);
    }

    // (c) 普通裁判手动修改进行中的对阵结构（即使是在 round 未变的情况下，往 currentMatches 强行加人）
    // 比如在轮次为 2 时，currentMatches 应该是空的，但裁判偷偷塞入比赛
    const maliciousMatchTour = {
      ...updatedTour,
      currentMatches: [
        {
          id: "m_hacked",
          team1: { id: "team_1", name: "队伍一" },
          team2: { id: "team_4", name: "队伍四" },
          completed: false,
          winner: null,
          score1: 0,
          score2: 0
        }
      ]
    };
    const maliciousMatchStore = {
      ...originalStore,
      tournaments: [maliciousMatchTour, ...(originalStore.tournaments || [])]
    };
    const maliciousMatchRes = await request('/api/store', 'POST', maliciousMatchStore);
    if (maliciousMatchRes.status === 403) {
      console.log('✅ 成功拦截裁判恶意生成/修改对阵操作 (403)');
    } else {
      throw new Error(`安全漏洞：后端未能拦截普通裁判恶意生成对阵的操作，状态码: ${maliciousMatchRes.status}`);
    }

    console.log('\n🎉 所有自动推进验证与安全防御拦截测试全部通过！');

  } catch (err) {
    console.error('❌ 测试执行过程中发生错误:', err);
    process.exit(1);
  }
}

runTest();
