const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = 3000;

// 配置中间件
app.use(cors()); // 允许跨域
app.use(express.json({ limit: '50mb' })); // 允许较大的 JSON 载荷（虽然我们的数据不大）

// 静态文件托管：把现有的前端页面通过后端提供服务
// 注意：我们的前端代码就在项目根目录下
app.use(express.static(path.join(__dirname, '../')));

// API 路由
// 获取最新数据
app.get('/api/store', async (req, res) => {
  try {
    const data = await db.getData();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Failed to get data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 保存数据
app.post('/api/store', async (req, res) => {
  try {
    const dataObj = req.body;
    await db.saveData(dataObj);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to save data:', err);
    res.status(500).json({ success: false, error: err.message });
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
  console.log('📡 新客户端已连接 WebSocket');

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
              lastUpdated: Date.now()
            };
            broadcast({ type: 'STATE_SYNC', payload: globalLiveMatches });
            console.log(`🏀 比赛实时同步已开启：[${data.payload.matchId}] ${data.payload.home.name} vs ${data.payload.away.name}`);
          }
          break;

        case 'MATCH_UPDATE':
          if (data.payload && data.payload.matchId) {
            const mid = data.payload.matchId;
            if (globalLiveMatches[mid]) {
              globalLiveMatches[mid] = {
                ...globalLiveMatches[mid],
                ...data.payload,
                lastUpdated: Date.now()
              };
              broadcast({ type: 'STATE_SYNC', payload: globalLiveMatches });
            }
          }
          break;

        case 'MATCH_END':
          if (data.payload && data.payload.matchId) {
            const mid = data.payload.matchId;
            console.log(`🏆 比赛 [${mid}] 已结束并提交，清除其实时广播状态`);
            delete globalLiveMatches[mid];
            broadcast({ type: 'STATE_SYNC', payload: globalLiveMatches });
          } else {
            // 回退处理：如果没有发 matchId，则清空所有（兼容老逻辑）
            console.log('🏆 收到未指定ID的比赛结束信号，清除所有进行中比赛');
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
            broadcast({
              type: 'DANMAKU',
              payload: {
                matchId: data.payload.matchId,
                text: data.payload.text,
                color: data.payload.color || '#ffffff',
                time: Date.now()
              }
            });
          }
          break;
      }
    } catch (err) {
      console.error('解析 WebSocket 消息失败:', err);
    }
  });

  ws.on('close', () => {
    console.log('🔌 客户端断开 WebSocket 连接');
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 篮球比赛工具后端服务已启动!`);
  console.log(`👉 浏览器访问: http://localhost:${PORT}`);
  console.log(`=================================`);
});
