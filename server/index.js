const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const http = require('http');
const WebSocket = require('ws');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const app = express();
const PORT = 3000;

// 配置中间件
app.use(cors()); // 允许跨域
app.use(express.json({ limit: '50mb' })); // 允许较大的 JSON 载荷（虽然我们的数据不大）

// 静态文件托管：把现有的前端页面通过后端提供服务
// 注意：我们的前端代码就在项目根目录下
app.use(express.static(path.join(__dirname, '../')));

const crypto = require('crypto');

// 内存中维护的会话
const activeSessions = {}; // token => sessionData

// 登录认证中间件
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未登录，请先登录' });
  }
  const token = authHeader.split(' ')[1];
  const session = activeSessions[token];
  if (!session || session.expiresAt < Date.now()) {
    if (session) delete activeSessions[token]; // 清理过期 session
    return res.status(401).json({ success: false, error: '登录已失效，请重新登录' });
  }
  req.session = session;
  next();
};

// 管理员认证中间件
const requireAdmin = (req, res, next) => {
  requireAuth(req, res, () => {
    if (req.session.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足，仅管理员可进行此操作' });
    }
    next();
  });
};

// API 路由

// 注册接口
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, nickname, password, confirmPassword } = req.body;
    if (!username || !nickname || !password || !confirmPassword) {
      return res.status(400).json({ success: false, error: '请填写所有必填字段' });
    }
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ success: false, error: '用户名格式错误：须为3-20位英文、数字或下划线' });
    }
    if (nickname.length < 2 || nickname.length > 10) {
      return res.status(400).json({ success: false, error: '昵称长度错误：须为2-10位字符' });
    }
    if (password.length < 6 || password.length > 20) {
      return res.status(400).json({ success: false, error: '密码长度错误：须为6-20位' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: '两次输入的密码不一致' });
    }
    
    // 检查用户名是否已存在
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ success: false, error: '用户名已存在' });
    }

    const passwordHash = db.hashPassword(password);
    await db.createUser(username, nickname, passwordHash, 'player');
    res.json({ success: true, message: '注册成功' });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 登录接口
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: '请填写用户名和密码' });
    }

    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(400).json({ success: false, error: '用户名或密码错误' });
    }

    const hash = db.hashPassword(password);
    if (user.password_hash !== hash) {
      return res.status(400).json({ success: false, error: '用户名或密码错误' });
    }

    // 生成随机 token
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions[token] = {
      userId: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 小时过期
    };

    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        nickname: user.nickname,
        role: user.role
      }
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取当前登录用户信息
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: {
      username: req.session.username,
      nickname: req.session.nickname,
      role: req.session.role
    }
  });
});

// 修改当前登录用户昵称
app.post('/api/auth/update-nickname', requireAuth, async (req, res) => {
  try {
    const { nickname } = req.body;
    if (!nickname) {
      return res.status(400).json({ success: false, error: '昵称不能为空' });
    }
    if (nickname.length < 2 || nickname.length > 10) {
      return res.status(400).json({ success: false, error: '昵称长度错误：须为2-10位字符' });
    }

    const userId = req.session.userId;
    const success = await db.updateUserNickname(userId, nickname);
    if (success) {
      // 同步更新 session
      req.session.nickname = nickname;
      for (const token in activeSessions) {
        if (activeSessions[token].userId === userId) {
          activeSessions[token].nickname = nickname;
        }
      }
      res.json({ success: true, message: '昵称修改成功' });
    } else {
      res.status(400).json({ success: false, error: '修改昵称失败，用户未找到' });
    }
  } catch (err) {
    console.error('修改个人昵称失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 修改当前登录用户密码
app.post('/api/auth/update-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, error: '请填写所有必填字段' });
    }
    if (newPassword.length < 6 || newPassword.length > 20) {
      return res.status(400).json({ success: false, error: '密码长度错误：须为6-20位' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: '两次输入的密码不一致' });
    }

    const userId = req.session.userId;
    const user = await db.getUserByUsername(req.session.username);
    if (!user || db.hashPassword(oldPassword) !== user.password_hash) {
      return res.status(400).json({ success: false, error: '原密码输入错误' });
    }

    const hash = db.hashPassword(newPassword);
    const success = await db.updateUserPassword(userId, hash);
    if (success) {
      res.json({ success: true, message: '密码修改成功' });
    } else {
      res.status(400).json({ success: false, error: '修改密码失败' });
    }
  } catch (err) {
    console.error('修改个人密码失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取所有用户列表 (仅限管理员)
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json({ success: true, users });
  } catch (err) {
    console.error('获取用户列表失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 修改用户密码 (仅限管理员)
app.post('/api/users/update-password', requireAdmin, async (req, res) => {
  try {
    const { userId, newPassword, confirmPassword } = req.body;
    if (!userId || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, error: '请填写所有必填字段' });
    }
    if (newPassword.length < 6 || newPassword.length > 20) {
      return res.status(400).json({ success: false, error: '密码长度错误：新密码须为6-20位' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: '两次输入的密码不一致' });
    }

    const hash = db.hashPassword(newPassword);
    const success = await db.updateUserPassword(userId, hash);
    if (success) {
      res.json({ success: true, message: '密码修改成功' });
    } else {
      res.status(400).json({ success: false, error: '修改密码失败，未找到该用户' });
    }
  } catch (err) {
    console.error('修改用户密码失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 修改用户昵称 (仅限管理员)
app.post('/api/users/update-nickname', requireAdmin, async (req, res) => {
  try {
    const { userId, newNickname } = req.body;
    if (!userId || !newNickname) {
      return res.status(400).json({ success: false, error: '用户 ID 和新昵称不能为空' });
    }
    if (newNickname.length < 2 || newNickname.length > 10) {
      return res.status(400).json({ success: false, error: '新昵称长度错误：须为2-10位' });
    }

    const success = await db.updateUserNickname(userId, newNickname);
    if (success) {
      // 如果修改的是当前发送请求的管理员自己，需要在 Session 里也同步修改昵称
      if (parseInt(userId) === req.session.userId) {
        req.session.nickname = newNickname;
        
        // 我们也需要更新 activeSessions 里的这一项
        for (const token in activeSessions) {
          if (activeSessions[token].userId === req.session.userId) {
            activeSessions[token].nickname = newNickname;
          }
        }
      }
      res.json({ success: true, message: '昵称修改成功' });
    } else {
      res.status(400).json({ success: false, error: '修改昵称失败，未找到该用户' });
    }
  } catch (err) {
    console.error('修改用户昵称失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除用户 (仅限管理员)
app.post('/api/users/delete', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: '用户 ID 不能为空' });
    }

    if (parseInt(userId) === req.session.userId) {
      return res.status(400).json({ success: false, error: '不能删除您当前的登录账号' });
    }

    const success = await db.deleteUser(userId);
    if (success) {
      res.json({ success: true, message: '用户删除成功' });
    } else {
      res.status(400).json({ success: false, error: '删除用户失败，未找到该用户' });
    }
  } catch (err) {
    console.error('删除用户失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取最新数据
app.get('/api/store', requireAuth, async (req, res) => {
  try {
    const data = await db.getData();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Failed to get data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 差分数据权限校验
 * 限制只有管理员角色（'admin'）可以修改队伍列表（报名删除）、修改归档历史（pastTournaments）、手动重置或手动归档。
 * 允许球员/普通裁判角色修改合法的当前进行中比赛数据。
 */
function validateStoreChange(oldStore, newStore, role) {
  // 向下兼容：如果用户的角色是 admin，则绿灯通行；其他角色（包括 player 和老数据的 referee）都需要经过严格校验
  if (role === 'admin') return { valid: true };

  // 1. 检查 teams (报名管理及队伍删除)
  const oldTeams = oldStore.teams || [];
  const newTeams = newStore.teams || [];
  if (JSON.stringify(oldTeams) !== JSON.stringify(newTeams)) {
    return { valid: false, error: '权限不足，仅系统管理员可进行报名登记与删除队伍操作' };
  }

  // 2. 检查 pastTournaments (归档历史及重置)
  const oldPast = oldStore.pastTournaments || [];
  const newPast = newStore.pastTournaments || [];
  if (JSON.stringify(oldPast) !== JSON.stringify(newPast)) {
    return { valid: false, error: '权限不足，仅系统管理员可删除或修改历史归档记录' };
  }

  // 3. 检查 tournament (当前赛程)
  const oldT = oldStore.tournament;
  const newT = newStore.tournament;

  // 3.1 归档与清空检查：旧赛程存在，但新赛程被置为 null（代表发生了归档或大面积清空重置）
  if (oldT && !newT) {
    return { valid: false, error: '权限不足，仅系统管理员可执行赛程归档或重置操作' };
  }

  // 3.2 抽签与重新抽签检查：
  const oldMatches = (oldT && oldT.currentMatches) || [];
  const newMatches = (newT && newT.currentMatches) || [];
  
  // 抽签：新数据突然生成了比赛，而原本没有比赛
  if (oldMatches.length === 0 && newMatches.length > 0) {
    return { valid: false, error: '权限不足，仅系统管理员可执行随机抽签创建对阵' };
  }

  // 3.3 如果轮次被非管理员手动改动
  if (oldT && newT && oldT.round !== newT.round) {
    // 完赛自动推进机制放行：如果旧比赛列表中的所有比赛均已完赛，且新比赛列表置空，这是系统合法的阶段推进，允许放行。
    const oldAllCompleted = oldMatches.length > 0 && oldMatches.every(m => m.completed);
    const newMatchesCleared = newMatches.length === 0;
    const isNormalProgression = oldAllCompleted && newMatchesCleared && newT.round === oldT.round + 1;
    
    if (!isNormalProgression) {
      return { valid: false, error: '权限不足，仅系统管理员可手动修改或重置赛程轮次' };
    }
  }

  // 3.4 检查正在进行的对阵列表是否被篡改（长度或对阵队伍ID变更）
  if (oldT && newT && oldMatches.length > 0 && newMatches.length > 0) {
    if (oldMatches.length !== newMatches.length) {
      return { valid: false, error: '权限不足，仅系统管理员可手动变更比赛对阵结构' };
    }
    for (let i = 0; i < oldMatches.length; i++) {
      if (oldMatches[i].id !== newMatches[i].id || 
          (oldMatches[i].team1 && newMatches[i].team1 && oldMatches[i].team1.id !== newMatches[i].team1.id) ||
          (oldMatches[i].team2 && newMatches[i].team2 && oldMatches[i].team2.id !== newMatches[i].team2.id)) {
        return { valid: false, error: '权限不足，仅系统管理员可修改对阵球队信息' };
      }
    }
  }

  return { valid: true };
}

// 保存数据
app.post('/api/store', requireAuth, async (req, res) => {
  try {
    const dataObj = req.body;
    
    // 获取当前在数据库里的旧数据
    const oldData = await db.getData();
    
    // 进行敏感操作安全性差分校验
    const checkResult = validateStoreChange(oldData, dataObj, req.session.role);
    if (!checkResult.valid) {
      console.warn(`🔒 越权数据修改拦截: 用户 ${req.session.username} (Role: ${req.session.role}) 尝试执行敏感修改被拦截: ${checkResult.error}`);
      return res.status(403).json({ success: false, error: checkResult.error });
    }

    await db.saveData(dataObj);

    // 🚨 核心同步：后端根据保存的真实赛程数据状态，同步清理 WebSocket 内存中的直播间，防止“僵尸直播间”残留
    if (typeof globalLiveMatches !== 'undefined' && typeof broadcast === 'function') {
      if (!dataObj.tournament) {
        // 如果赛程变为了 null（已被归档或未初始化），则清空所有正在进行的直播
        if (Object.keys(globalLiveMatches).length > 0) {
          console.log('📝 后端检测到赛程归档（tournament为null），自动清空所有实时直播间状态');
          globalLiveMatches = {};
          broadcast({ type: 'STATE_SYNC', payload: globalLiveMatches });
        }
      } else {
        // 如果赛程仍在进行，但部分比赛被剔除（比如重新抽签、比赛不再属于 currentMatches 等）
        if (dataObj.tournament.currentMatches) {
          const activeMatchIds = new Set(dataObj.tournament.currentMatches.map(m => m.id));
          let changed = false;
          Object.keys(globalLiveMatches).forEach(mid => {
            if (!activeMatchIds.has(mid)) {
              console.log(`📝 后端检测到比赛 [${mid}] 不在当前赛程进行中对阵中，自动从直播列表中删除`);
              delete globalLiveMatches[mid];
              changed = true;
            }
          });
          if (changed) {
            broadcast({ type: 'STATE_SYNC', payload: globalLiveMatches });
          }
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to save data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 语音合成播报接口
app.get('/api/tts', async (req, res) => {
  try {
    const text = req.query.text;
    const voice = req.query.voice || 'zh-CN-YunxiNeural'; // 默认云希高质男声
    
    if (!text) {
      return res.status(400).send('text parameter is required');
    }

    // 限制单次语音合成的最大长度为 50 字，与前端对齐
    const cleanText = text.toString().substring(0, 50);

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    
    const { audioStream } = tts.toStream(cleanText);

    // 设置 Content-Type 为 MPEG 音频格式以供浏览器直接解码播放
    res.setHeader('Content-Type', 'audio/mpeg');

    audioStream.pipe(res);

    audioStream.on('error', (err) => {
      console.error('🔊 TTS 转换流出错:', err);
      if (!res.headersSent) {
        res.status(500).send('TTS processing stream error');
      }
    });
  } catch (err) {
    console.error('🔊 TTS 合成失败:', err);
    if (!res.headersSent) {
      res.status(500).send(err.message);
    }
  }
});

// 创建共享端口的 HTTP Server 和 WebSocket Server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 内存中维护的当前进行中的比赛状态字典，key 为 matchId
let globalLiveMatches = {};

// 广播状态至所有客户端
const broadcast = (data) => {
  const messageStr = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
};

wss.on('connection', (ws) => {
  // 分配唯一的 clientId
  ws.id = Date.now().toString(36) + Math.random().toString(36).substr(2);
  console.log(`📡 新客户端已连接 WebSocket (ID: ${ws.id})`);

  // 当新客户端连接时，立刻同步当前的进行中比赛列表给它
  ws.send(JSON.stringify({
    type: 'STATE_SYNC',
    payload: globalLiveMatches
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      switch (data.type) {
        case 'MATCH_START':
          if (data.payload && data.payload.matchId) {
            // 记分员启动比赛，初始化该场实时比赛状态
            globalLiveMatches[data.payload.matchId] = {
              matchId: data.payload.matchId,
              roundName: data.payload.roundName || '',
              home: data.payload.home,
              away: data.payload.away,
              timeRemaining: data.payload.timeRemaining || 600,
              currentPeriod: data.payload.currentPeriod || 1,
              isRunning: false,
              hasVideo: data.payload.hasVideo || false,
              videoStreamUrl: data.payload.videoStreamUrl || '',
              danmakuHistory: [], // 初始化弹幕历史记录队列
              controllerId: ws.id, // 锁定控制权
              lastUpdated: Date.now()
            };
            broadcast({ type: 'STATE_SYNC', payload: globalLiveMatches });
            console.log(`🏀 比赛实时同步已开启：[${data.payload.matchId}] ${data.payload.home.name} vs ${data.payload.away.name} (Controller: ${ws.id})`);
          }
          break;

        case 'REQUEST_CONTROL':
          if (data.payload && data.payload.matchId) {
            const mid = data.payload.matchId;
            const match = globalLiveMatches[mid];
            if (match) {
              // 比赛存在，检查是否被其他人占用
              if (!match.controllerId || match.controllerId === ws.id) {
                match.controllerId = ws.id; // 授予/刷新控制权
                ws.send(JSON.stringify({ type: 'CONTROL_RESPONSE', payload: { matchId: mid, success: true } }));
              } else {
                // 已被占用，拒绝并通知客户端
                ws.send(JSON.stringify({ type: 'CONTROL_RESPONSE', payload: { matchId: mid, success: false, occupiedBy: match.controllerId } }));
              }
            } else {
              // 比赛尚未开始广播，允许获取控制权，后续会由 MATCH_START 补全
              ws.send(JSON.stringify({ type: 'CONTROL_RESPONSE', payload: { matchId: mid, success: true } }));
            }
          }
          break;

        case 'FORCE_TAKE_CONTROL':
          if (data.payload && data.payload.matchId) {
            const mid = data.payload.matchId;
            const match = globalLiveMatches[mid];
            if (match) {
              const oldControllerId = match.controllerId;
              match.controllerId = ws.id;
              console.log(`⚠️ 比赛 [${mid}] 控制权被强制接管：${oldControllerId} -> ${ws.id}`);
              
              // 单独通知老裁判控制权已丢失
              wss.clients.forEach(client => {
                if (client.id === oldControllerId && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({ type: 'CONTROL_LOST', payload: { matchId: mid } }));
                }
              });
              
              ws.send(JSON.stringify({ type: 'CONTROL_RESPONSE', payload: { matchId: mid, success: true } }));
            } else {
              // 如果比赛本身还没在服务器中建立
              ws.send(JSON.stringify({ type: 'CONTROL_RESPONSE', payload: { matchId: mid, success: true } }));
            }
          }
          break;

        case 'MATCH_UPDATE':
          if (data.payload && data.payload.matchId) {
            const mid = data.payload.matchId;
            if (globalLiveMatches[mid]) {
              // 防并发校验：只有当前的 controllerId 才允许更新比赛状态
              if (globalLiveMatches[mid].controllerId && globalLiveMatches[mid].controllerId !== ws.id) {
                console.log(`⚠️ 拒绝非法控制更新: matchId=${mid}, 发送方=${ws.id}, 当前控制者=${globalLiveMatches[mid].controllerId}`);
                ws.send(JSON.stringify({ type: 'CONTROL_REJECTED', payload: { matchId: mid } }));
                return;
              }

              globalLiveMatches[mid] = {
                ...globalLiveMatches[mid],
                ...data.payload,
                controllerId: ws.id, // 确保控制权不被 payload 覆盖
                lastUpdated: Date.now()
              };
              broadcast({ type: 'STATE_SYNC', payload: globalLiveMatches });
            }
          }
          break;

        case 'MATCH_END':
          if (data.payload && data.payload.matchId) {
            const mid = data.payload.matchId;
            if (globalLiveMatches[mid] && globalLiveMatches[mid].controllerId && globalLiveMatches[mid].controllerId !== ws.id) {
              console.log(`⚠️ 拒绝非法结束比赛: matchId=${mid}, 发送方=${ws.id}`);
              ws.send(JSON.stringify({ type: 'CONTROL_REJECTED', payload: { matchId: mid } }));
              return;
            }
            console.log(`🏆 比赛 [${mid}] 已结束并提交，清除其实时广播状态及弹幕记录`);
            delete globalLiveMatches[mid];
            broadcast({ type: 'STATE_SYNC', payload: globalLiveMatches });
          } else {
            // 回退处理：如果没有发 matchId，则清空所有（兼容老逻辑）
            console.log('🏆 收到未指定ID的比赛结束信号，清除所有进行中比赛及弹幕记录');
            globalLiveMatches = {};
            broadcast({ type: 'STATE_SYNC', payload: globalLiveMatches });
          }
          break;

        case 'GET_STATE':
          // 客户端手动请求状态
          ws.send(JSON.stringify({ type: 'STATE_SYNC', payload: globalLiveMatches }));
          break;

        case 'DANMAKU':
          // 广播弹幕给所有连接的客户端
          if (data.payload && data.payload.matchId) {
            const matchId = data.payload.matchId;
            const danmakuPayload = {
              matchId: matchId,
              text: data.payload.text,
              color: data.payload.color || '#ffffff',
              nickname: data.payload.nickname || '', // 透传昵称
              isManual: !!data.payload.isManual,     // 透传是否为手动发送标志
              voice: data.payload.voice || 'zh-CN-YunjianNeural', // 透传音色
              time: Date.now()
            };

            // 保存到弹幕历史队列
            if (globalLiveMatches[matchId]) {
              if (!globalLiveMatches[matchId].danmakuHistory) {
                globalLiveMatches[matchId].danmakuHistory = [];
              }
              globalLiveMatches[matchId].danmakuHistory.push(danmakuPayload);
              // 限制最多保存 200 条，防止内存泄露
              if (globalLiveMatches[matchId].danmakuHistory.length > 200) {
                globalLiveMatches[matchId].danmakuHistory.shift();
              }
            }

            broadcast({
              type: 'DANMAKU',
              payload: danmakuPayload
            });
          }
          break;
      }
    } catch (err) {
      console.error('解析 WebSocket 消息失败:', err);
    }
  });

  ws.on('close', () => {
    console.log(`🔌 客户端断开 WebSocket 连接 (ID: ${ws.id})`);
    // 释放该客户端拥有的所有比赛控制权
    Object.keys(globalLiveMatches).forEach(mid => {
      if (globalLiveMatches[mid].controllerId === ws.id) {
        console.log(`🔓 客户端离线，释放比赛 [${mid}] 的控制权`);
        globalLiveMatches[mid].controllerId = null;
      }
    });
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 篮球比赛工具后端服务已启动!`);
  console.log(`👉 浏览器访问: http://localhost:${PORT}`);
  console.log(`=================================`);
});
