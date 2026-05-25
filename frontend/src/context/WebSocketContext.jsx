import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useApp } from './AppContext';

const WebSocketContext = createContext(null);

export const useWebSocket = () => useContext(WebSocketContext);

export const WebSocketProvider = ({ children }) => {
  const { token } = useApp();
  const [connected, setConnected] = useState(false);
  const [liveMatches, setLiveMatches] = useState({});

  const wsRef = useRef(null);
  const queueRef = useRef([]); // 断网期间排队的消息
  const controlCallbacksRef = useRef({ onResponse: null, onLost: null });
  // 弹幕回调注册表：key = matchId，value = callback(payload)
  // 采用直接回调而非 state 队列，避免多个卡片重复消费同一条弹幕
  const danmakuCallbacksRef = useRef(new Map());

  // 广播 WebSocket 发送方法
  const sendWsMessage = (type, payload) => {
    const msg = { type, payload };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn(`⏳ WebSocket 未连通，已将消息 [${type}] 存入排队队列`);
      queueRef.current.push(msg);
    }
  };

  // 快捷发送方法 (可直接复用至 RN！)
  const sendAuth = (userToken) => sendWsMessage('AUTH', { token: userToken });
  const sendMatchStart = (payload) => sendWsMessage('MATCH_START', payload);
  const sendMatchUpdate = (payload) => sendWsMessage('MATCH_UPDATE', payload);
  const sendMatchEnd = (matchId) => sendWsMessage('MATCH_END', { matchId });
  const sendDanmaku = (payload) => sendWsMessage('DANMAKU', payload);

  // 注册控制权响应的回调（由 MatchConsole 组件订阅）
  const registerControlCallbacks = (onResponse, onLost) => {
    controlCallbacksRef.current = { onResponse, onLost };
  };

  // 注册/注销弹幕接收回调（由 LiveMatchCard 组件按 matchId 订阅）
  const registerDanmakuHandler = (matchId, callback) => {
    danmakuCallbacksRef.current.set(matchId, callback);
  };
  const unregisterDanmakuHandler = (matchId) => {
    danmakuCallbacksRef.current.delete(matchId);
  };

  useEffect(() => {
    let reconnectTimer = null;

    const connect = () => {
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.port === '5173' ? `${window.location.hostname}:3000` : window.location.host;
        const wsUrl = `${wsProtocol}//${wsHost}`;
        console.log(`🔌 正在建立 WebSocket 实时同步长连接...`);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('📡 实时比分同步连接已建立');
          setConnected(true);

          // 如果本地有 token，连接开通时立刻握手鉴权
          if (token) {
            ws.send(JSON.stringify({ type: 'AUTH', payload: { token } }));
          }

          // 重发断连排队的消息
          if (queueRef.current.length > 0) {
            queueRef.current.forEach(msg => ws.send(JSON.stringify(msg)));
            queueRef.current = [];
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            switch (message.type) {
              case 'STATE_SYNC':
                setLiveMatches(message.payload || {});
                break;
              case 'DANMAKU':
                if (message.payload && message.payload.matchId) {
                  // 直接调用对应 matchId 的回调，精准投递，不经过 React state
                  const cb = danmakuCallbacksRef.current.get(message.payload.matchId);
                  if (cb) cb(message.payload);
                }
                break;
              case 'CONTROL_RESPONSE':
                if (controlCallbacksRef.current.onResponse) {
                  controlCallbacksRef.current.onResponse(message.payload);
                }
                break;
              case 'CONTROL_LOST':
                if (controlCallbacksRef.current.onLost) {
                  controlCallbacksRef.current.onLost(message.payload);
                }
                break;
            }
          } catch (e) {
            console.error('解析服务器 WebSocket 数据包失败:', e);
          }
        };

        ws.onerror = (err) => {
          console.error('WebSocket 连接发生错误:', err);
        };

        ws.onclose = () => {
          console.warn('实时同步连接已断开，3秒后自动尝试重连...');
          setConnected(false);
          reconnectTimer = setTimeout(() => connect(), 3000);
        };
      } catch (err) {
        console.error('创建 WebSocket 实例失败', err);
        reconnectTimer = setTimeout(() => connect(), 3000);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token]);

  return (
    <WebSocketContext.Provider value={{
      connected,
      liveMatches,
      sendWsMessage,
      sendAuth,
      sendMatchStart,
      sendMatchUpdate,
      sendMatchEnd,
      sendDanmaku,
      registerControlCallbacks,
      registerDanmakuHandler,
      unregisterDanmakuHandler,
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};
