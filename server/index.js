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
