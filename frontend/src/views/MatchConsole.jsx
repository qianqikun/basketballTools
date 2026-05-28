import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useWebSocket } from '../context/WebSocketContext';
import { useTimer } from '../hooks/useTimer';
import './MatchConsole.css';

export default function MatchConsole({ match, onBack }) {
  const { store, saveStore, currentUser } = useApp();
  const { sendWsMessage, registerControlCallbacks, liveMatches } = useWebSocket();

  // 精密倒计时 Hook
  const {
    timeRemaining,
    setTimeRemaining,
    isRunning,
    setIsRunning,
    startClock,
    stopClock,
    toggleClock,
    resetClock,
    formatTime
  } = useTimer(600, () => {
    alert('时间到！');
    saveAndSync({ isRunning: false, timeRemaining: 0 });
  });

  // 主客队数据状态
  const [homeScore, setHomeScore] = useState(0);
  const [homeFouls, setHomeFouls] = useState(0);
  const [homeTimeouts, setHomeTimeouts] = useState(0);

  const [awayScore, setAwayScore] = useState(0);
  const [awayFouls, setAwayFouls] = useState(0);
  const [awayTimeouts, setAwayTimeouts] = useState(0);

  const [period, setPeriod] = useState(1);

  // 视频直播设置状态
  const [liveVideoEnable, setLiveVideoEnable] = useState(false);
  const [liveVideoUrl, setLiveVideoUrl] = useState('');
  const [isLiveSettingsOpen, setIsLiveSettingsOpen] = useState(false);

  // 权限遮罩状态
  const [overlayType, setOverlayType] = useState('loading'); // 'loading' | 'error' | 'empty' | null
  const [overlayMessage, setOverlayMessage] = useState('正在获取控制权...');
  const [overlaySubtext, setOverlaySubtext] = useState('请稍候，系统正在向服务器申请比赛控制锁。');

  // 用于防脏读的 ref
  const controlPendingRef = useRef(true);

  // 保存并同步当前数据给大屏及服务器
  const saveAndSync = (updatedFields = {}) => {
    if (!match) return;

    const data = {
      home: {
        name: match.team1.name,
        score: updatedFields.homeScore !== undefined ? updatedFields.homeScore : homeScore,
        fouls: updatedFields.homeFouls !== undefined ? updatedFields.homeFouls : homeFouls,
        timeouts: updatedFields.homeTimeouts !== undefined ? updatedFields.homeTimeouts : homeTimeouts,
      },
      away: {
        name: match.team2.name,
        score: updatedFields.awayScore !== undefined ? updatedFields.awayScore : awayScore,
        fouls: updatedFields.awayFouls !== undefined ? updatedFields.awayFouls : awayFouls,
        timeouts: updatedFields.awayTimeouts !== undefined ? updatedFields.awayTimeouts : awayTimeouts,
      },
      timeRemaining: updatedFields.timeRemaining !== undefined ? updatedFields.timeRemaining : timeRemaining,
      currentPeriod: updatedFields.period !== undefined ? updatedFields.period : period,
      isRunning: updatedFields.isRunning !== undefined ? updatedFields.isRunning : isRunning,
      hasVideo: updatedFields.liveVideoEnable !== undefined ? updatedFields.liveVideoEnable : liveVideoEnable,
      videoStreamUrl: updatedFields.liveVideoUrl !== undefined ? updatedFields.liveVideoUrl : liveVideoUrl,
    };

    // 缓存至 localStorage
    localStorage.setItem(
      'hoops_manager_live_match',
      JSON.stringify({
        matchId: match.id,
        home: data.home,
        away: data.away,
        timeRemaining: data.timeRemaining,
        currentPeriod: data.currentPeriod,
        hasVideo: data.hasVideo,
        videoStreamUrl: data.videoStreamUrl,
      })
    );

    const referee = currentUser ? {
      username: currentUser.username,
      nickname: currentUser.nickname
    } : null;

    // 向 WS 发送更新包
    sendWsMessage('MATCH_UPDATE', {
      matchId: match.id,
      ...data,
      referee
    });
  };

  // 首发开赛广播
  const sendStartSignal = (currentFields = {}) => {
    if (!match) return;

    const hasVideoVal = currentFields.liveVideoEnable !== undefined ? currentFields.liveVideoEnable : liveVideoEnable;
    let videoUrlVal = currentFields.liveVideoUrl !== undefined ? currentFields.liveVideoUrl : liveVideoUrl;
    if (hasVideoVal && !videoUrlVal) {
      videoUrlVal = `webrtc://${window.location.hostname}/live/show_${match.id}`;
    }

    const referee = currentUser ? {
      username: currentUser.username,
      nickname: currentUser.nickname
    } : null;

    sendWsMessage('MATCH_START', {
      matchId: match.id,
      roundName: match.roundName || '',
      home: {
        name: match.team1.name,
        score: currentFields.homeScore !== undefined ? currentFields.homeScore : homeScore,
        fouls: currentFields.homeFouls !== undefined ? currentFields.homeFouls : homeFouls,
        timeouts: currentFields.homeTimeouts !== undefined ? currentFields.homeTimeouts : homeTimeouts,
      },
      away: {
        name: match.team2.name,
        score: currentFields.awayScore !== undefined ? currentFields.awayScore : awayScore,
        fouls: currentFields.awayFouls !== undefined ? currentFields.awayFouls : awayFouls,
        timeouts: currentFields.awayTimeouts !== undefined ? currentFields.awayTimeouts : awayTimeouts,
      },
      timeRemaining: currentFields.timeRemaining !== undefined ? currentFields.timeRemaining : timeRemaining,
      currentPeriod: currentFields.period !== undefined ? currentFields.period : period,
      hasVideo: hasVideoVal,
      videoStreamUrl: videoUrlVal,
      referee
    });
  };

  // 1. 初始化或恢复现场数据，请求裁判控制锁
  useEffect(() => {
    if (!match) return;

    controlPendingRef.current = true;

    const serverMatch = liveMatches && liveMatches[match.id];
    const saved = localStorage.getItem('hoops_manager_live_match');
    let restored = null;
    if (serverMatch) {
      restored = serverMatch;
    } else if (saved) {
      try {
        const liveData = JSON.parse(saved);
        if (liveData.matchId === match.id) {
          restored = liveData;
        }
      } catch (e) {}
    }

    let initialHomeScore = match.score1 || 0;
    let initialHomeFouls = 0;
    let initialHomeTimeouts = 0;
    let initialAwayScore = match.score2 || 0;
    let initialAwayFouls = 0;
    let initialAwayTimeouts = 0;
    let initialTime = 600;
    let initialPeriod = 1;
    let initialLiveVideo = false;
    let initialLiveUrl = '';

    if (restored) {
      initialHomeScore = restored.home.score;
      initialHomeFouls = restored.home.fouls;
      initialHomeTimeouts = restored.home.timeouts;
      initialAwayScore = restored.away.score;
      initialAwayFouls = restored.away.fouls;
      initialAwayTimeouts = restored.away.timeouts;
      initialTime = restored.timeRemaining;
      initialPeriod = restored.currentPeriod || 1;
      initialLiveVideo = restored.hasVideo || false;
      initialLiveUrl = restored.videoStreamUrl || '';
    } else {
      const globalLiveEnabled = localStorage.getItem('hoops_manager_global_live_enabled') === 'true';
      const globalLiveUrl = localStorage.getItem('hoops_manager_global_live_url') || '';
      initialLiveVideo = globalLiveEnabled;
      initialLiveUrl = globalLiveUrl;
    }

    setHomeScore(initialHomeScore);
    setHomeFouls(initialHomeFouls);
    setHomeTimeouts(initialHomeTimeouts);
    setAwayScore(initialAwayScore);
    setAwayFouls(initialAwayFouls);
    setAwayTimeouts(initialAwayTimeouts);
    setPeriod(initialPeriod);
    setLiveVideoEnable(initialLiveVideo);
    setLiveVideoUrl(initialLiveUrl);
    setTimeRemaining(initialTime);

    // 遮罩提示
    setOverlayType('loading');
    setOverlayMessage('正在获取控制权...');
    setOverlaySubtext('请稍候，系统正在向服务器申请比赛控制锁。');

    // 发起控制权请求
    sendWsMessage('REQUEST_CONTROL', { matchId: match.id });

    // 订阅 WS 控制权回调
    registerControlCallbacks(
      (payload) => handleControlResponse(payload, {
        homeScore: initialHomeScore,
        homeFouls: initialHomeFouls,
        homeTimeouts: initialHomeTimeouts,
        awayScore: initialAwayScore,
        awayFouls: initialAwayFouls,
        awayTimeouts: initialAwayTimeouts,
        timeRemaining: initialTime,
        period: initialPeriod,
        liveVideoEnable: initialLiveVideo,
        liveVideoUrl: initialLiveUrl
      }),
      (payload) => handleControlLost(payload)
    );

    return () => {
      // 退出组件时，清空回调订阅
      registerControlCallbacks(null, null);
    };
  }, [match?.id]);

  // 控制权响应处理
  const handleControlResponse = (payload, currentFields) => {
    if (payload.matchId !== match.id) return;
    if (payload.success) {
      controlPendingRef.current = false;
      setOverlayType(null);
      // 获取成功后发 START 信号
      sendStartSignal(currentFields);
    } else {
      setOverlayType('error');
      if (payload.error) {
        setOverlayMessage('获取控制权失败');
        setOverlaySubtext(payload.error);
        alert(`❌ ${payload.error}`);
        onBack();
        return;
      }
      setOverlayMessage('该比赛已被占用');
      setOverlaySubtext('另一台设备正在控制此比赛。');

      setTimeout(() => {
        if (confirm(`⚠️ 警告：该场比赛正由另一台设备控制中！\n\n是否强行接管此比赛的裁判控制权？\n(注意：强行接管将踢出对方，并接管此比赛！)`)) {
          setOverlayType('loading');
          setOverlayMessage('正在强行接管...');
          setOverlaySubtext('请稍候...');
          sendWsMessage('FORCE_TAKE_CONTROL', { matchId: match.id });
        } else {
          controlPendingRef.current = false;
          onBack();
        }
      }, 500);
    }
  };

  // 被强制接管踢出或因控制新比赛而自动断开
  const handleControlLost = (payload) => {
    if (payload.matchId === match.id) {
      stopClock();
      if (payload.reason === 'another_control_started') {
        alert('⚠️ 您已在其他设备或页面开始控制新的比赛，当前比赛控制已自动断开。');
      } else {
        alert('⚠️ 您的控制权已被另一台设备强制接管！\n为防止比分冲突，已安全退出控制面板。');
      }
      onBack();
    }
  };

  // 2. 倒计时运行状态监听及自校准 WS 同步
  const syncCounterRef = useRef(0);
  useEffect(() => {
    if (!match) return;
    
    // 如果仍在获取控制权过程中，严禁自动同步，防止默认初始状态（如 liveVideoEnable=false）覆盖真实赛况
    if (controlPendingRef.current) return;

    if (!isRunning) {
      // 暂停时立刻同步
      saveAndSync({ isRunning: false });
      return;
    }

    // 运行中每 2 秒同步一次
    syncCounterRef.current++;
    if (syncCounterRef.current >= 2) {
      saveAndSync({ isRunning: true });
      syncCounterRef.current = 0;
    }
  }, [timeRemaining, isRunning, match]);

  // 离开控制台
  const handleExit = () => {
    stopClock();
    onBack();
  };

  // 评分操作
  const updateScore = (team, points) => {
    if (team === 'home') {
      const next = Math.max(0, homeScore + points);
      setHomeScore(next);
      saveAndSync({ homeScore: next });
    } else {
      const next = Math.max(0, awayScore + points);
      setAwayScore(next);
      saveAndSync({ awayScore: next });
    }
  };

  // 犯规和暂停操作
  const updateStat = (team, stat, val) => {
    if (team === 'home') {
      if (stat === 'fouls') {
        const next = Math.max(0, homeFouls + val);
        setHomeFouls(next);
        saveAndSync({ homeFouls: next });
      } else {
        const next = Math.max(0, homeTimeouts + val);
        setHomeTimeouts(next);
        saveAndSync({ homeTimeouts: next });
      }
    } else {
      if (stat === 'fouls') {
        const next = Math.max(0, awayFouls + val);
        setAwayFouls(next);
        saveAndSync({ awayFouls: next });
      } else {
        const next = Math.max(0, awayTimeouts + val);
        setAwayTimeouts(next);
        saveAndSync({ awayTimeouts: next });
      }
    }
  };

  // 切换节数
  const changePeriod = (val) => {
    const next = Math.max(1, period + val);
    setPeriod(next);
    saveAndSync({ period: next });
  };

  // 重置倒计时
  const handleResetClock = () => {
    if (confirm('确定重置时间到10分钟吗？')) {
      resetClock(600);
      saveAndSync({ timeRemaining: 600, isRunning: false });
    }
  };

  // 切换视频直播开关
  const handleLiveToggle = (e) => {
    const enabled = e.target.checked;
    setLiveVideoEnable(enabled);
    localStorage.setItem('hoops_manager_global_live_enabled', enabled ? 'true' : 'false');
    saveAndSync({ liveVideoEnable: enabled });
  };

  // 自定义视频拉流地址输入
  const handleLiveUrlInput = (e) => {
    const val = e.target.value.trim();
    setLiveVideoUrl(val);
    localStorage.setItem('hoops_manager_global_live_url', val);
    saveAndSync({ liveVideoUrl: val });
  };

  // 复制推流地址
  const copyPushUrl = () => {
    const hostname = window.location.hostname;
    const pushUrl = `rtmp://${hostname}:1935/live/show_${match.id}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pushUrl).then(() => {
        alert('推流地址已复制到剪贴板，请在推流软件中粘贴使用！');
      }).catch(() => {
        alert(`请手动复制推流地址：\n${pushUrl}`);
      });
    } else {
      alert(`请手动复制推流地址：\n${pushUrl}`);
    }
  };

  // 提交并结束比赛
  const finishMatch = () => {
    if (homeScore === awayScore) {
      alert('比分相同，无法决出胜负，请先通过加时赛决定胜者！');
      return;
    }

    if (confirm('确定要结束本场比赛并提交比分吗？提交后无法修改。')) {
      stopClock();
      
      const tState = { ...store.tournament };
      const matchIndex = tState.currentMatches.findIndex(m => m.id === match.id);
      
      if (matchIndex !== -1) {
        const currentM = { ...tState.currentMatches[matchIndex] };
        currentM.score1 = homeScore;
        currentM.score2 = awayScore;
        currentM.completed = true;
        
        // 判定胜负并记录赢家
        if (currentM.score1 > currentM.score2) {
          currentM.winner = currentM.team1;
        } else {
          currentM.winner = currentM.team2;
        }

        // 仅在淘汰赛阶段剔除输球的球队（循环赛阶段所有球队仍需参与后续积分计算和比赛）
        if (tState.stage !== 'group') {
          const loserId = currentM.score1 > currentM.score2 ? currentM.team2.id : currentM.team1.id;
          tState.activeTeams = tState.activeTeams.filter(team => team.id !== loserId);
        }

        tState.currentMatches[matchIndex] = currentM;

        // 判定本阶段或轮次是否全部打完
        const allCompleted = tState.currentMatches.every(m => m.completed);
        if (allCompleted) {
          // 仅在淘汰赛阶段才在全部完赛后归档轮次、推进轮次并置空当前对阵
          // 循环赛阶段必须保留 currentMatches 用以计算积分榜，并由管理员手动点击“晋级”生成下一阶段对阵
          if (tState.stage !== 'group') {
            tState.history.push({
              round: tState.round,
              matches: JSON.parse(JSON.stringify(tState.currentMatches))
            });
            tState.round += 1;
            tState.currentMatches = [];
          }
        }

        // 清理本地比赛缓存
        localStorage.removeItem('hoops_manager_live_match');
        localStorage.removeItem('hoops_manager_active_match_id');

        // 保存锦标赛状态
        saveStore('tournament', tState);
        
        // 比赛结束广播，清除大屏看版
        sendWsMessage('MATCH_END', { matchId: match.id });

        alert(`比赛结束！胜者是：${currentM.winner.name}`);
        onBack();
      }
    }
  };

  // 若没有执裁比赛，则显示空控制状态/加载中遮罩
  if (!match) {
    const hasActiveMatchId = localStorage.getItem('hoops_manager_active_match_id');
    return (
      <section id="match" className="view-section active" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', width: '100%' }}>
        <div className="overlay-content">
          {hasActiveMatchId ? (
            <>
              <div className="status-icon-wrapper">
                <i className="bx bx-loader-alt bx-spin"></i>
              </div>
              <h3>正在加载比赛数据...</h3>
              <p>请稍候，系统正在从服务器同步赛程信息。</p>
            </>
          ) : (
            <>
              <div className="status-icon-wrapper">
                <i className="bx bx-box"></i>
              </div>
              <h3>没有比赛控制中</h3>
              <p>请先在“抽签对阵”页面选择一场比赛进入控制。</p>
            </>
          )}
          <button className="secondary-btn" style={{ marginTop: '1.5rem', marginLeft: 'auto', marginRight: 'auto' }} onClick={onBack}>
            <i className="bx bx-arrow-back"></i> 返回对阵列表
          </button>
        </div>
      </section>
    );
  }

  // 生成推流和一键扫码地址
  const hostname = window.location.hostname;
  const pushUrl = `rtmp://${hostname}:1935/live/show_${match.id}`;
  const larixUrl = pushUrl.replace('rtmp://', 'larix://');
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(larixUrl)}`;

  const refereeText = currentUser ? ` (执裁裁判: ${currentUser.nickname})` : '';

  return (
    <section id="match" className="view-section active" style={{ display: 'block' }}>
      {/* 执裁控制权锁定遮罩 */}
      {overlayType && (
        <div id="match-control-overlay" className="control-overlay">
          <div className="overlay-content">
            <div className="status-icon-wrapper">
              <i className={overlayType === 'loading' ? 'bx bx-loader-alt bx-spin' : overlayType === 'error' ? 'bx bx-error-circle' : 'bx bx-box'}></i>
            </div>
            <h3>{overlayMessage}</h3>
            <p>{overlaySubtext}</p>
            {overlayType === 'error' && (
              <button className="secondary-btn" style={{ marginTop: '1.5rem', marginLeft: 'auto', marginRight: 'auto' }} onClick={handleExit}>
                <i className="bx bx-arrow-back"></i> 返回对阵列表
              </button>
            )}
          </div>
        </div>
      )}

      <div className="scoreboard-container" id="match-scoreboard-container" style={{ filter: overlayType ? 'blur(8px)' : 'none', pointerEvents: overlayType ? 'none' : 'auto' }}>
        <div className="match-info-bar">
          <span>当前对阵{refereeText}</span>
          <button id="back-to-tournament" className="secondary-btn" onClick={handleExit}>
            <i className="bx bx-arrow-back"></i> 返回对阵
          </button>
        </div>

        {/* 现场视频直播设置折叠面板 */}
        <div className="live-settings-accordion">
          <button className={`accordion-header ${isLiveSettingsOpen ? 'active' : ''}`} onClick={() => setIsLiveSettingsOpen(!isLiveSettingsOpen)}>
            <i className="bx bx-video"></i> <span>现场视频直播设置</span> <i className={`bx bx-chevron-down toggle-icon ${isLiveSettingsOpen ? 'rotate-180' : ''}`} style={{ transform: isLiveSettingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}></i>
          </button>
          <div className={`accordion-content ${isLiveSettingsOpen ? 'show' : ''}`} style={{ display: isLiveSettingsOpen ? 'block' : 'none' }}>
            <div className="settings-row">
              <label className="switch-container">
                <input type="checkbox" id="live-video-enable" checked={liveVideoEnable} onChange={handleLiveToggle} />
                <span className="switch-slider"></span>
                开启视频直播
              </label>
              {liveVideoEnable && (
                <div className="input-group" id="live-url-input-group" style={{ marginLeft: '2rem', flex: 1 }}>
                  <input type="text" id="live-video-url" placeholder="自定义 WebRTC 拉流地址 (如 webrtc://[Host]/live/show，留空则自动生成)" value={liveVideoUrl} onChange={handleLiveUrlInput} />
                </div>
              )}
            </div>

            {liveVideoEnable && (
              <div className="live-stream-guide" id="live-stream-guide" style={{ display: 'flex' }}>
                <div className="guide-item">
                  <span className="guide-label">RTMP 推流地址:</span>
                  <div className="copy-box">
                    <input type="text" id="live-push-url-display" value={pushUrl} readOnly />
                    <button id="copy-push-url-btn" className="icon-btn" title="复制推流地址" type="button" onClick={copyPushUrl}>
                      <i className="bx bx-copy"></i>
                    </button>
                  </div>
                </div>
                <div className="guide-item qr-guide-item">
                  <span className="guide-label">iPhone 扫码快捷推流 (用自带相机扫描):</span>
                  <div className="qr-code-wrapper">
                    <img src={qrCodeUrl} alt="Larix推流二维码" style={{ width: '120px', height: '120px', border: '4px solid #fff', borderRadius: '4px' }} />
                  </div>
                </div>
                <div className="notice-box">
                  <i className="bx bx-info-circle"></i>
                  <span>请使用 Larix Broadcaster 等推流软件。若使用 iPhone，直接用自带相机扫描上方二维码，在弹出的提示中点击“在 Larix 中打开”即可一键导入推流配置并开始推流！</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="scoreboard-main">
          {/* 客队 */}
          <div className="team-score-card away-team">
            <h2 className="team-name">{match.team2.name}</h2>
            <div className="score-display">{awayScore.toString().padStart(2, '0')}</div>
            <div className="score-actions">
              <button className="score-btn" onClick={() => updateScore('away', 1)}>+1</button>
              <button className="score-btn" onClick={() => updateScore('away', 2)}>+2</button>
              <button className="score-btn" onClick={() => updateScore('away', 3)}>+3</button>
              <button className="score-btn danger" onClick={() => updateScore('away', -1)}>-1</button>
            </div>
            <div className="stats-row">
              <div className="stat-item">
                <span>犯规</span>
                <div className="stat-control">
                  <button className="small-btn" onClick={() => updateStat('away', 'fouls', -1)}>-</button>
                  <span>{awayFouls}</span>
                  <button className="small-btn" onClick={() => updateStat('away', 'fouls', 1)}>+</button>
                </div>
              </div>
              <div className="stat-item">
                <span>暂停</span>
                <div className="stat-control">
                  <button className="small-btn" onClick={() => updateStat('away', 'timeouts', -1)}>-</button>
                  <span>{awayTimeouts}</span>
                  <button className="small-btn" onClick={() => updateStat('away', 'timeouts', 1)}>+</button>
                </div>
              </div>
            </div>
          </div>

          {/* 中间时钟区域 */}
          <div className="center-clock-area">
            <div className="period-display" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button className="small-btn" style={{ width: '20px', height: '20px', fontSize: '0.8rem' }} onClick={() => changePeriod(-1)}>-</button>
              <span>第 {period} 节</span>
              <button className="small-btn" style={{ width: '20px', height: '20px', fontSize: '0.8rem' }} onClick={() => changePeriod(1)}>+</button>
            </div>
            <div className="main-clock">{formatTime(timeRemaining)}</div>
            <div className="clock-controls">
              <button id="start-stop-btn" className="primary-btn play-btn" style={{ backgroundColor: isRunning ? 'var(--danger)' : '' }} onClick={toggleClock}>
                <i className={isRunning ? 'bx bx-pause' : 'bx bx-play'}></i> {isRunning ? '暂停' : '开始'}
              </button>
              <button id="reset-clock-btn" className="secondary-btn" onClick={handleResetClock}>
                <i className="bx bx-reset"></i> 重置
              </button>
            </div>
            <button id="finish-match-btn" className="success-btn large-btn" style={{ marginTop: '2rem' }} onClick={finishMatch}>
              <i className="bx bx-check-circle"></i> 结束并提交比赛
            </button>
          </div>

          {/* 主队 */}
          <div className="team-score-card home-team">
            <h2 className="team-name">{match.team1.name}</h2>
            <div className="score-display">{homeScore.toString().padStart(2, '0')}</div>
            <div className="score-actions">
              <button className="score-btn" onClick={() => updateScore('home', 1)}>+1</button>
              <button className="score-btn" onClick={() => updateScore('home', 2)}>+2</button>
              <button className="score-btn" onClick={() => updateScore('home', 3)}>+3</button>
              <button className="score-btn danger" onClick={() => updateScore('home', -1)}>-1</button>
            </div>
            <div className="stats-row">
              <div className="stat-item">
                <span>犯规</span>
                <div className="stat-control">
                  <button className="small-btn" onClick={() => updateStat('home', 'fouls', -1)}>-</button>
                  <span>{homeFouls}</span>
                  <button className="small-btn" onClick={() => updateStat('home', 'fouls', 1)}>+</button>
                </div>
              </div>
              <div className="stat-item">
                <span>暂停</span>
                <div className="stat-control">
                  <button className="small-btn" onClick={() => updateStat('home', 'timeouts', -1)}>-</button>
                  <span>{homeTimeouts}</span>
                  <button className="small-btn" onClick={() => updateStat('home', 'timeouts', 1)}>+</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
