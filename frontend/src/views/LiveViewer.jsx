import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useWebSocket } from '../context/WebSocketContext';
import './LiveViewer.css';

// 全局 TTS 播放队列与状态，保证多场比赛观战时声音不会重叠
const globalSpeechQueue = [];
let isGlobalSpeaking = false;
let currentAudio = null;
let currentAudioMatchId = null;

const processSpeechQueue = () => {
  if (isGlobalSpeaking || globalSpeechQueue.length === 0) return;

  isGlobalSpeaking = true;
  const { matchId, nickname, text, voice } = globalSpeechQueue.shift();
  currentAudioMatchId = matchId;

  // 限制长度，截取前 40 个字
  const formatText = `${nickname}说：${text}`.substring(0, 40);
  const activeVoice = voice || 'zh-CN-YunjianNeural';
  const audioUrl = `/api/tts?text=${encodeURIComponent(formatText)}&voice=${activeVoice}`;

  const audio = new Audio(audioUrl);
  currentAudio = audio;

  const cleanupAndNext = () => {
    audio.onended = null;
    audio.onerror = null;
    currentAudio = null;
    currentAudioMatchId = null;
    isGlobalSpeaking = false;

    // 稍微延迟 100 毫秒后播下一条
    setTimeout(() => {
      processSpeechQueue();
    }, 100);
  };

  audio.onended = cleanupAndNext;
  audio.onerror = (err) => {
    console.warn('🔊 TTS 播放失败，自动跳过此条', err);
    cleanupAndNext();
  };

  audio.play().catch((err) => {
    console.warn('🔊 播放音频被浏览器策略拦截或出错，跳过该条', err);
    cleanupAndNext();
  });
};

const speakDanmaku = (matchId, nickname, text, voice) => {
  if (globalSpeechQueue.length >= 30) {
    console.log('🔊 TTS 语音队列已满，丢弃该条语音：', text);
    return;
  }
  globalSpeechQueue.push({ matchId, nickname, text, voice });
  processSpeechQueue();
};

export default function LiveViewer() {
  const { liveMatches } = useWebSocket();
  const matchIds = Object.keys(liveMatches);

  return (
    <section id="live" className="view-section active" style={{ display: 'block' }}>
      <header className="section-header">
        <h1>📡 实时观战</h1>
        <p>多端实时同步的现场大屏幕比分与计时直播。</p>
      </header>

      {matchIds.length === 0 ? (
        <div id="live-empty-state" className="empty-state" style={{ display: 'flex' }}>
          <i className="bx bx-broadcast" style={{ animation: 'blink 2s infinite', color: 'var(--primary-color)' }}></i>
          <h3>暂无进行中的比赛</h3>
          <p>当前没有正在进行的比赛，正在等待裁判开哨...</p>
        </div>
      ) : (
        <div id="live-active-matches" className="live-matches-container" style={{ display: 'grid' }}>
          {matchIds.map((matchId) => (
            <LiveMatchCard key={matchId} matchId={matchId} data={liveMatches[matchId]} />
          ))}
        </div>
      )}
    </section>
  );
}

// 独立的单场观战大屏幕卡片组件
function LiveMatchCard({ matchId, data }) {
  const { currentUser, sendWsMessage, registerDanmakuHandler, unregisterDanmakuHandler } = useWebSocket();
  const { currentUser: appUser } = useApp();

  const [localTime, setLocalTime] = useState(data.timeRemaining);
  const [isRunning, setIsRunning] = useState(data.isRunning || false);

  // UI 交互状态
  const [isLiveSettingsOpen, setIsLiveSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false); // 默认静音播放
  const [isPseudoFs, setIsPseudoFs] = useState(false);
  const [isMobileLandscapeFs, setIsMobileLandscapeFs] = useState(false);

  // 弹幕配置状态
  const [danmakuEnabled, setDanmakuEnabled] = useState(true);
  const [danmakuVoiceEnabled, setDanmakuVoiceEnabled] = useState(true);
  const [selectedColor, setSelectedColor] = useState('#ffffff');
  const [danmakuInput, setDanmakuInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(localStorage.getItem('live_danmaku_voice') || 'zh-CN-YunjianNeural');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // 跑马灯横幅提示
  const [tickerMessage, setTickerMessage] = useState('📡 实时数据同步成功 - 比赛直播中');
  const [tickerFlash, setTickerFlash] = useState(false);

  // DOM 和实例的 Ref
  const cardRef = useRef(null);
  const videoRef = useRef(null);
  const danmakuContainerRef = useRef(null);
  const historyListRef = useRef(null);
  const historyBodyRef = useRef(null);
  const playerRef = useRef(null);
  const lastChannelTimesRef = useRef([]);
  // 记录本地已即时播报的普通弹幕唯一 key，用于防止服务端广播回传时重复播报语音
  const selfSentVoiceTimestamps = useRef(new Set());

  // 记录上一次数据，用于判定得分、犯规、暂停高光事件
  const prevDataRef = useRef({
    homeScore: data.home.score,
    homeFouls: data.home.fouls,
    homeTimeouts: data.home.timeouts,
    awayScore: data.away.score,
    awayFouls: data.away.fouls,
    awayTimeouts: data.away.timeouts,
    currentPeriod: data.currentPeriod || 1
  });

  // 音色下拉框关闭监听
  useEffect(() => {
    const handleOutsideClick = () => {
      setIsVoiceDropdownOpen(false);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // 1. 初始化昵称
  useEffect(() => {
    if (appUser) {
      setNicknameInput(appUser.nickname || '');
    } else {
      setNicknameInput(localStorage.getItem('live_danmaku_nickname') || '');
    }
  }, [appUser]);

  // 2. 视频拉流播放器逻辑
  useEffect(() => {
    if (data.hasVideo) {
      initPlayer(data.videoStreamUrl);
    } else {
      destroyPlayer();
    }
    return () => destroyPlayer();
  }, [data.hasVideo, data.videoStreamUrl]);

  const initPlayer = (streamUrl) => {
    destroyPlayer();
    if (!videoRef.current) return;

    console.log(`🎬 准备拉取比赛 [${matchId}] 的 WebRTC 极速视频流: ${streamUrl}`);
    const SrsRtcPlayerAsync = window.SrsRtcPlayerAsync;
    if (typeof SrsRtcPlayerAsync !== 'undefined') {
      try {
        const player = new SrsRtcPlayerAsync();
        playerRef.current = player;

        player.play(streamUrl).then(() => {
          console.log(`✅ 比赛 [${matchId}] WebRTC 握手成功，开始播放`);
          if (videoRef.current) {
            videoRef.current.muted = !soundEnabled;
            videoRef.current.srcObject = player.stream;
            videoRef.current.play().catch((err) => {
              console.warn('浏览器拦截了自动播放，需要用户交互唤醒:', err);
            });
          }
        }).catch((err) => {
          console.error(`❌ 比赛 [${matchId}] WebRTC 播放信令握手失败:`, err);
        });
      } catch (err) {
        console.error('初始化 SrsRtcPlayerAsync 异常:', err);
      }
    }
  };

  const destroyPlayer = () => {
    if (playerRef.current) {
      console.log(`🔌 关闭比赛 [${matchId}] 的 WebRTC 直播拉流`);
      try {
        playerRef.current.close();
      } catch (e) {}
      playerRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.src = '';
      videoRef.current.srcObject = null;
    }
  };

  // 切换静音
  const toggleMute = () => {
    const nextSound = !soundEnabled;
    setSoundEnabled(nextSound);
    if (videoRef.current) {
      videoRef.current.muted = !nextSound;
    }
    triggerTickerMessage(nextSound ? '🔊 声音已开启' : '🔇 声音已静音');
  };

  // 3. 本地倒计时校准
  useEffect(() => {
    setLocalTime(data.timeRemaining);
    setIsRunning(data.isRunning);
  }, [data.timeRemaining, data.isRunning]);

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setLocalTime((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning]);

  // 4. 高光事件与氛围组弹幕检测
  useEffect(() => {
    const prev = prevDataRef.current;
    const curr = data;

    let msg = '';
    let eventType = '';

    // 得分高光
    if (curr.home.score > prev.homeScore) {
      const diff = curr.home.score - prev.homeScore;
      msg = `🔥 ${curr.home.name} 投中精彩一球，+${diff}分！比分 ${curr.away.score} : ${curr.home.score}`;
      eventType = 'home_score';
    } else if (curr.away.score > prev.awayScore) {
      const diff = curr.away.score - prev.awayScore;
      msg = `⚡ ${curr.away.name} 强攻得手，+${diff}分！比分 ${curr.away.score} : ${curr.home.score}`;
      eventType = 'away_score';
    }
    // 犯规广播
    else if (curr.home.fouls > prev.homeFouls || curr.away.fouls > prev.awayFouls) {
      if (curr.home.fouls > prev.homeFouls) {
        msg = `⚠️ 裁判哨响！${curr.home.name} 被吹罚犯规！`;
      } else {
        msg = `⚠️ 裁判哨响！${curr.away.name} 被吹罚犯规！`;
      }
      eventType = 'foul';
    }
    // 暂停广播
    else if (curr.home.timeouts > prev.homeTimeouts || curr.away.timeouts > prev.awayTimeouts) {
      if (curr.home.timeouts > prev.homeTimeouts) {
        msg = `⏱️ 暂停！${curr.home.name} 请求战术调整。`;
      } else {
        msg = `⏱️ 暂停！${curr.away.name} 请求战术调整。`;
      }
      eventType = 'timeout';
    }
    // 节数变更
    else if (curr.currentPeriod !== prev.currentPeriod) {
      msg = `🏁 哨声响起，比赛进入第 ${curr.currentPeriod} 节！`;
      eventType = 'period';
    }

    if (msg) {
      triggerTickerMessage(msg, true);
      if (eventType) {
        triggerEventDanmakus(eventType);
      }
    }

    // 更新 ref 数据缓存
    prevDataRef.current = {
      homeScore: curr.home.score,
      homeFouls: curr.home.fouls,
      homeTimeouts: curr.home.timeouts,
      awayScore: curr.away.score,
      awayFouls: curr.away.fouls,
      awayTimeouts: curr.away.timeouts,
      currentPeriod: curr.currentPeriod || 1
    };
  }, [data]);

  // 高光横幅触发器
  const triggerTickerMessage = (text, flash = false) => {
    setTickerMessage(text);
    if (flash) {
      setTickerFlash(false);
      setTimeout(() => setTickerFlash(true), 20);
    }
  };

  // 5. 渲染并射出一条弹幕
  const renderDanmaku = (text, color) => {
    if (!danmakuEnabled || !danmakuContainerRef.current) return;

    const danmakuEl = document.createElement('div');
    danmakuEl.className = 'danmaku-item';
    danmakuEl.textContent = text;
    danmakuEl.style.color = color || '#ffffff';

    // 动态计算弹幕起始横向偏移（适配伪横屏旋转）
    const containerWidth = danmakuContainerRef.current.offsetWidth || window.innerWidth;
    danmakuEl.style.setProperty('--danmaku-start', `${containerWidth}px`);

    // 轨道防重叠分配算法
    const isMobileLandscape = !!isMobileLandscapeFs;
    const channelHeight = isMobileLandscape ? 26 : 38;
    const maxChannels = isMobileLandscape ? 6 : 8;
    const now = Date.now();

    if (lastChannelTimesRef.current.length !== maxChannels) {
      lastChannelTimesRef.current = new Array(maxChannels).fill(0);
    }

    let availableChannels = [];
    for (let i = 0; i < maxChannels; i++) {
      if (now > lastChannelTimesRef.current[i]) {
        availableChannels.push(i);
      }
    }

    let selectedChannel = 0;
    if (availableChannels.length > 0) {
      selectedChannel = availableChannels[Math.floor(Math.random() * availableChannels.length)];
    } else {
      let minTime = lastChannelTimesRef.current[0];
      let minIndex = 0;
      for (let i = 1; i < maxChannels; i++) {
        if (lastChannelTimesRef.current[i] < minTime) {
          minTime = lastChannelTimesRef.current[i];
          minIndex = i;
        }
      }
      selectedChannel = minIndex;
    }

    lastChannelTimesRef.current[selectedChannel] = now + 2500; // 防抖2.5秒

    const topPos = (isMobileLandscape ? 10 : 20) + selectedChannel * channelHeight;
    danmakuEl.style.top = `${topPos}px`;

    danmakuContainerRef.current.appendChild(danmakuEl);

    danmakuEl.addEventListener('animationend', () => {
      danmakuEl.remove();
    });
  };

  // 氛围组随机弹幕
  const triggerEventDanmakus = (eventType) => {
    if (!danmakuEnabled) return;

    const danmakuPools = {
      home_score: ["🔥 漂亮！！", "主队威武！", "这球太硬了！", "神射手啊！", "主队加油！冲！", "这配合绝了！", "帅呆了这球！", "防不住啊", "打三分！", "直接一波流带走！"],
      away_score: ["⚡ 好球好球！", "客队强啊！", "咬住比分了！", "这球投得真果断！", "三分刷网！舒服！", "客队加油！", "追分时刻到了！", "硬气！", "好球！", "这球厉害了！"],
      foul: ["⚠️ 吹哨了吹哨了", "这个动作有点大", "防守要注意啊", "犯规了，送对方上罚球线？", "强度拉起来了！", "防守动作收一下"],
      timeout: ["⏱️ 开始画战术板了", "这暂停叫得很及时", "歇一口气，下回合继续", "两边打得火药味十足", "重新布置下防守吧", "主力可以缓一缓了"],
      period: ["🏁 这节太精彩了！", "拼体力的时候到了", "下半场继续战斗", "两边打得有来有回", "精彩的对决！"]
    };

    const pool = danmakuPools[eventType];
    if (!pool) return;

    const count = Math.floor(Math.random() * 3) + 2; // 2-4条
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    const colors = ["#ffffff", "#ff4d4f", "#ffeb3b", "#4caf50", "#2196f3"];

    selected.forEach((text, idx) => {
      const delay = idx * 400 + Math.random() * 500;
      setTimeout(() => {
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        renderDanmaku(text, randomColor);
      }, delay);
    });
  };

  // 6. 弹幕接收处理器（直接回调注册，不经过 state 队列，彻底消除多卡片重复处理和重复播报问题）
  // 用 ref 存储最新的处理函数，防止回调闭包过期的问题
  const danmakuHandlerRef = useRef(null);

  danmakuHandlerRef.current = (payload) => {
    // 1. 如果面板打开，添加历史记录
    if (historyListRef.current) {
      appendHistoryItem(payload);
    }

    // 2. 射出弹幕
    if (danmakuEnabled) {
      renderDanmaku(payload.text, payload.color);
    }

    // 3. 语音播报：快捷弹幕不播报，普通弹幕且开启语音时播报
    //   此处收到的是服务端广播回来的弹幕（包括自己发的）
    //   自己发的普通弹幕已在本地即时播报过，通过 _selfSentKey 识别并跳过
    if (payload.isManual && !payload.isQuickReply && payload.nickname && danmakuVoiceEnabled) {
      if (payload._selfSentKey && selfSentVoiceTimestamps.current.has(payload._selfSentKey)) {
        // 这是自己发的普通弹幕，本地已即时播报，跳过广播回传的重复播报
        selfSentVoiceTimestamps.current.delete(payload._selfSentKey);
      } else {
        speakDanmaku(matchId, payload.nickname, payload.text, payload.voice);
      }
    }
  };

  // 组件挂载时注册回调，卸载时注销回调
  useEffect(() => {
    registerDanmakuHandler(matchId, (payload) => {
      // 通过 ref 调用最新的处理函数，隐式获取最新的 state 闭包
      if (danmakuHandlerRef.current) danmakuHandlerRef.current(payload);
    });
    return () => {
      unregisterDanmakuHandler(matchId);
    };
  }, [matchId]);

  // 添加到弹幕历史记录 DOM
  const appendHistoryItem = (payload) => {
    const li = document.createElement('li');
    const date = payload.time ? new Date(payload.time) : new Date();
    
    li.innerHTML = `
      <span class="history-time">[${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}]</span>
      <span class="history-nickname" style="color: ${payload.color || '#fff'}">${payload.nickname || '匿名'}:</span>
      <span class="history-text" style="color: ${payload.color || '#fff'}">${payload.text}</span>
    `;
    
    if (historyListRef.current) {
      historyListRef.current.appendChild(li);
      while (historyListRef.current.children.length > 200) {
        historyListRef.current.removeChild(historyListRef.current.firstChild);
      }
      if (isHistoryOpen && historyBodyRef.current) {
        historyBodyRef.current.scrollTop = historyBodyRef.current.scrollHeight;
      }
    }
  };

  // 7. 发送弹幕
  // isQuick: 是否为快捷弹幕（快捷弹幕不触发语音播报）
  const sendDanmaku = (text, isQuick = false) => {
    const name = nicknameInput.trim();
    if (!name) {
      alert('请先输入昵称再发送弹幕！');
      return;
    }
    const color = selectedColor;
    const voice = selectedVoice;

    if (sendWsMessage) {
      // 普通手动弹幕才做本地即时播报，快捷弹幕不播报语音
      if (!isQuick && danmakuVoiceEnabled) {
        // 生成唯一 key，用于在接收端识别这是自己发的，防止 WS 广播回传时重复播报
        const selfKey = `${Date.now()}_${Math.random()}`;
        selfSentVoiceTimestamps.current.add(selfKey);
        // 本地即时播报
        speakDanmaku(matchId, name, text, voice);
        // 将 key 附在 WS 消息里，接收端通过此 key 识别并跳过重复播报
        sendWsMessage('DANMAKU', {
          matchId,
          text,
          color,
          nickname: name,
          isManual: true,
          isQuickReply: false,
          voice,
          _selfSentKey: selfKey
        });
      } else {
        // 快捷弹幕：只发送弹幕消息，不触发任何语音
        sendWsMessage('DANMAKU', {
          matchId,
          text,
          color,
          nickname: name,
          isManual: true,
          isQuickReply: true,
          voice
        });
      }
    }
  };

  const handleSendBtn = () => {
    if (!danmakuInput.trim()) return;
    sendDanmaku(danmakuInput.trim(), false); // 普通输入框发送，触发语音
    setDanmakuInput('');
  };

  const handleShortcutClick = (text) => {
    sendDanmaku(text, true); // 快捷弹幕，不触发语音
  };

  // 8. 网页全屏与物理返回键监听
  const toggleFullscreen = () => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 900;

    if (isMobile) {
      const nextLand = !isMobileLandscapeFs;
      setIsMobileLandscapeFs(nextLand);
      triggerMobileLandscapeFullscreen(nextLand);
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isNativeFs = document.fullscreenElement === cardRef.current || document.webkitFullscreenElement === cardRef.current;

      if (isNativeFs || isPseudoFs) {
        // 退出全屏
        if (isNativeFs) {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else {
          setIsPseudoFs(false);
        }
      } else {
        if (isIOS) {
          setIsPseudoFs(true);
        } else {
          try {
            if (cardRef.current.requestFullscreen) cardRef.current.requestFullscreen();
            else if (cardRef.current.webkitRequestFullscreen) cardRef.current.webkitRequestFullscreen();
          } catch (e) {
            setIsPseudoFs(true);
          }
        }
      }
    }
  };

  // 伪横屏全屏设置
  const triggerMobileLandscapeFullscreen = (enable) => {
    if (enable) {
      try {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) docEl.requestFullscreen().catch(() => {});
        else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
      } catch (e) {}
      triggerTickerMessage('🖥️ 已进入横屏全屏模式');
      window.history.pushState({ isMobileLandscapeFs: true, matchId }, '');
    } else {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        }
      } catch (e) {}
      triggerTickerMessage('🖥️ 已退出全屏模式');
      if (window.history.state && window.history.state.isMobileLandscapeFs) {
        window.history.back();
      }
    }
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
  };

  // 监听原生退出全屏事件
  useEffect(() => {
    const handleNativeFsChange = () => {
      const isFs = document.fullscreenElement === cardRef.current || document.webkitFullscreenElement === cardRef.current;
      if (!isFs && !isPseudoFs) {
        // 确保类名被移除
        setIsPseudoFs(false);
      }
    };
    document.addEventListener('fullscreenchange', handleNativeFsChange);
    document.addEventListener('webkitfullscreenchange', handleNativeFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleNativeFsChange);
      document.removeEventListener('webkitfullscreenchange', handleNativeFsChange);
    };
  }, [isPseudoFs]);

  // 监听物理返回键，清空伪横屏全屏
  useEffect(() => {
    const handlePopState = (e) => {
      if (isMobileLandscapeFs) {
        setIsMobileLandscapeFs(false);
        triggerMobileLandscapeFullscreen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isMobileLandscapeFs]);

  // 关闭卡片语音时，从全局队列中剔除当前比赛的 TTS
  const toggleVoiceEnable = () => {
    const nextVoice = !danmakuVoiceEnabled;
    setDanmakuVoiceEnabled(nextVoice);
    if (!nextVoice) {
      // 关掉时过滤待播报
      const filtered = globalSpeechQueue.filter(item => item.matchId !== matchId);
      globalSpeechQueue.length = 0;
      globalSpeechQueue.push(...filtered);

      // 若正在播，强行中断
      if (currentAudio && currentAudioMatchId === matchId) {
        try {
          currentAudio.pause();
        } catch (e) {}
        isGlobalSpeaking = false;
        setTimeout(() => processSpeechQueue(), 100);
      }
      triggerTickerMessage('🔇 弹幕语音已关闭');
    } else {
      triggerTickerMessage('🔊 弹幕语音已开启');
    }
  };

  // 色彩配置
  const colors = ["#ffffff", "#ff4d4f", "#ffeb3b", "#4caf50", "#2196f3"];
  const formatSecs = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 决定最终类名
  const isFsMode = isPseudoFs || isMobileLandscapeFs;
  const cardClassName = `live-scoreboard-panel ${data.hasVideo ? 'has-live' : ''} ${isFsMode ? 'live-fullscreen-mode' : ''} ${isMobileLandscapeFs ? 'live-mobile-landscape-fullscreen' : ''} ${isHistoryOpen ? 'has-history-open' : ''}`;

  return (
    <div ref={cardRef} className={cardClassName} id={`live-card-${matchId}`}>
      {/* 跑马灯高光事件横幅 */}
      <div className={`live-ticker-wrap ${tickerFlash ? 'ticker-flash' : ''}`}>
        <div className="live-ticker-message">{tickerMessage}</div>
      </div>

      <div className="live-scoreboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', width: '100%' }}>
        {data.roundName && (
          <span className="live-round-tag" style={{ display: 'inline-block' }}>
            {data.roundName}
          </span>
        )}
        {data.referee && data.referee.nickname && (
          <span className="live-referee-info" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>
            裁判: {data.referee.nickname}
          </span>
        )}
        <span className="live-status-badge">
          <span className="pulse-dot"></span> 直播中
        </span>
      </div>

      <div className="live-scoreboard-content">
        <div className="live-scoreboard-body">
          {/* 客队 */}
          <div className="live-team-card away">
            <h2 className="live-team-name">{data.away.name}</h2>
            <div className="live-score-value">{data.away.score.toString().padStart(2, '0')}</div>
            <div className="live-stats-bar">
              <div className="live-stat-box">
                <span className="label">犯规</span>
                <span className="value">{data.away.fouls}</span>
              </div>
              <div className="live-stat-box">
                <span className="label">暂停</span>
                <span className="value">{data.away.timeouts}</span>
              </div>
            </div>
          </div>

          {/* 中央计时区域 */}
          <div className="live-center-col live-center-time">
            <div className="live-period">第 {data.currentPeriod || 1} 节</div>
            <div className="live-timer-clock">{formatSecs(localTime)}</div>
            <div className="live-timer-state" style={{ color: isRunning ? 'var(--success)' : 'var(--text-secondary)' }}>
              {isRunning ? '进行中' : '已暂停'}
            </div>
          </div>

          {/* 主队 */}
          <div className="live-team-card home">
            <h2 className="live-team-name">{data.home.name}</h2>
            <div className="live-score-value">{data.home.score.toString().padStart(2, '0')}</div>
            <div className="live-stats-bar">
              <div className="live-stat-box">
                <span className="label">犯规</span>
                <span className="value">{data.home.fouls}</span>
              </div>
              <div className="live-stat-box">
                <span className="label">暂停</span>
                <span className="value">{data.home.timeouts}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 视频直播区域 */}
        <div className="live-video-wrapper" style={{ display: data.hasVideo ? 'block' : 'none' }}>
          <button className="fullscreen-toggle-btn" title="网页全屏/退出" onClick={toggleFullscreen}>
            <i className={`bx ${isFsMode ? 'bx-exit-fullscreen' : 'bx-fullscreen'}`}></i>
          </button>
          <button className="volume-toggle-btn" title="静音/取消静音" onClick={toggleMute}>
            <i className={`bx ${soundEnabled ? 'bx-volume-full' : 'bx-volume-mute'}`}></i>
          </button>

          {!playerRef.current && (
            <div className="video-overlay">
              <i className="bx bx-loader-alt bx-spin"></i>
              <span>正在连接极速视频信号...</span>
            </div>
          )}
          <video ref={videoRef} muted playsInline webkit-playsinline></video>
        </div>

        {/* 弹幕流层 */}
        <div ref={danmakuContainerRef} className="danmaku-container" style={{ display: danmakuEnabled ? 'block' : 'none' }}></div>

        {/* 弹幕控制与发送栏 */}
        <div className="live-danmaku-control-bar">
          <div className="danmaku-shortcuts">
            {["🔥 666", "👍 好球！", "🏀 漂亮！", "🛡️ 防守！", "⚡ 绝杀！"].map((item, idx) => (
              <span key={idx} className="danmaku-shortcut-item" onClick={() => handleShortcutClick(item)}>
                {item}
              </span>
            ))}
          </div>

          <div className="danmaku-input-row">
            <button className={`danmaku-toggle-btn ${danmakuEnabled ? 'active' : ''}`} title="开启/关闭弹幕" onClick={() => setDanmakuEnabled(!danmakuEnabled)}>
              <i className="bx bx-message-rounded-dots"></i>
            </button>
            <button className={`danmaku-voice-toggle-btn ${danmakuVoiceEnabled ? 'active' : ''}`} title="开启/关闭弹幕语音" onClick={toggleVoiceEnable}>
              <i className={`bx ${danmakuVoiceEnabled ? 'bx-volume-full' : 'bx-volume-mute'}`}></i>
            </button>

            {/* 音色下拉框 */}
            <div className={`danmaku-voice-select-container ${!danmakuVoiceEnabled ? 'disabled' : ''}`}>
              <button className="danmaku-voice-select-trigger" title="选择弹幕播报音色" disabled={!danmakuVoiceEnabled} onClick={(e) => {
                e.stopPropagation();
                setIsVoiceDropdownOpen(!isVoiceDropdownOpen);
              }}>
                <span className="selected-voice-text">
                  {selectedVoice === 'zh-CN-YunjianNeural' ? '🏀 云健 (男解说)' :
                   selectedVoice === 'zh-CN-YunxiNeural' ? '💬 云希 (活泼男)' :
                   selectedVoice === 'zh-CN-YunyangNeural' ? '🎙️ 云阳 (专业男)' :
                   selectedVoice === 'zh-CN-XiaoxiaoNeural' ? '👩 晓晓 (活泼女)' :
                   selectedVoice === 'zh-CN-liaoning-XiaobeiNeural' ? '⚡ 晓北 (辽宁女)' :
                   '🛡️ 晓妮 (陕西女)'}
                </span>
                <i className="bx bx-chevron-up dropdown-arrow"></i>
              </button>
              <ul className={`danmaku-voice-dropdown-list ${isVoiceDropdownOpen ? 'show' : ''}`}>
                <li className={selectedVoice === 'zh-CN-YunjianNeural' ? 'active' : ''} onClick={() => { setSelectedVoice('zh-CN-YunjianNeural'); localStorage.setItem('live_danmaku_voice', 'zh-CN-YunjianNeural'); }}>🏀 云健 (男解说)</li>
                <li className={selectedVoice === 'zh-CN-YunxiNeural' ? 'active' : ''} onClick={() => { setSelectedVoice('zh-CN-YunxiNeural'); localStorage.setItem('live_danmaku_voice', 'zh-CN-YunxiNeural'); }}>💬 云希 (活泼男)</li>
                <li className={selectedVoice === 'zh-CN-YunyangNeural' ? 'active' : ''} onClick={() => { setSelectedVoice('zh-CN-YunyangNeural'); localStorage.setItem('live_danmaku_voice', 'zh-CN-YunyangNeural'); }}>🎙️ 云阳 (专业男)</li>
                <li className={selectedVoice === 'zh-CN-XiaoxiaoNeural' ? 'active' : ''} onClick={() => { setSelectedVoice('zh-CN-XiaoxiaoNeural'); localStorage.setItem('live_danmaku_voice', 'zh-CN-XiaoxiaoNeural'); }}>👩 晓晓 (活泼女)</li>
                <li className={selectedVoice === 'zh-CN-liaoning-XiaobeiNeural' ? 'active' : ''} onClick={() => { setSelectedVoice('zh-CN-liaoning-XiaobeiNeural'); localStorage.setItem('live_danmaku_voice', 'zh-CN-liaoning-XiaobeiNeural'); }}>⚡ 晓北 (辽宁女)</li>
                <li className={selectedVoice === 'zh-CN-shaanxi-XiaoniNeural' ? 'active' : ''} onClick={() => { setSelectedVoice('zh-CN-shaanxi-XiaoniNeural'); localStorage.setItem('live_danmaku_voice', 'zh-CN-shaanxi-XiaoniNeural'); }}>🛡️ 晓妮 (陕西女)</li>
              </ul>
            </div>

            <button className={`danmaku-history-toggle-btn ${isHistoryOpen ? 'active' : ''}`} title="开启/关闭历史弹幕记录" onClick={() => setIsHistoryOpen(!isHistoryOpen)}>
              <i className="bx bx-comment-detail"></i>
            </button>

            <div className="danmaku-color-selector">
              {colors.map((c) => (
                <span key={c} className={`danmaku-color-dot ${selectedColor === c ? 'active' : ''}`} data-color={c} style={{ background: c }} onClick={() => setSelectedColor(c)}></span>
              ))}
            </div>

            {!appUser && (
              <input type="text" className="danmaku-nickname-input" placeholder="昵称" maxLength={10} value={nicknameInput} onChange={(e) => {
                setNicknameInput(e.target.value);
                localStorage.setItem('live_danmaku_nickname', e.target.value.trim());
              }} />
            )}
            <input type="text" className="danmaku-input" placeholder="发个弹幕和大家一起聊球吧..." maxLength={50} value={danmakuInput} onChange={(e) => setDanmakuInput(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendBtn();
            }} />
            <button className="danmaku-send-btn" onClick={handleSendBtn}>发送</button>
          </div>
        </div>

        {/* 历史弹幕记录面板 */}
        <div className="danmaku-history-panel" style={{ display: isHistoryOpen ? 'flex' : 'none' }}>
          <div className="history-panel-header">
            <h3>💬 弹幕记录</h3>
            <button className="history-close-btn" title="关闭" onClick={() => setIsHistoryOpen(false)}>
              <i className="bx bx-x"></i>
            </button>
          </div>
          <div ref={historyBodyRef} className="history-panel-body">
            <ul ref={historyListRef} className="history-list"></ul>
          </div>
        </div>
      </div>
    </div>
  );
}
