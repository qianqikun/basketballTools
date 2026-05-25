import { useState, useEffect, useRef } from 'react';

export const useTimer = (initialTime = 600, onTimeUp = null) => {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef(null);

  // 启动计时器
  const startClock = () => {
    if (isRunning) return;
    setIsRunning(true);
  };

  // 暂停计时器
  const stopClock = () => {
    if (!isRunning) return;
    setIsRunning(false);
  };

  // 切换启动/暂停
  const toggleClock = () => {
    if (isRunning) stopClock();
    else startClock();
  };

  // 重置时间
  const resetClock = (seconds = 600) => {
    stopClock();
    setTimeRemaining(seconds);
  };

  // 监听运行状态，开启精密 setInterval
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setIsRunning(false);
            if (onTimeUp) onTimeUp();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning]);

  // 提供将秒转换为 MM:SS 可读字符串的辅助方法
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return {
    timeRemaining,
    setTimeRemaining,
    isRunning,
    setIsRunning,
    startClock,
    stopClock,
    toggleClock,
    resetClock,
    formatTime
  };
};
