import React, { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext(null);

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('hoops_token') || null);
  const [currentUser, setCurrentUser] = useState(null);
  const [store, setStore] = useState({ teams: [], tournament: null, pastTournaments: [] });
  const [currentView, setCurrentView] = useState(localStorage.getItem('hoops_manager_current_view') || 'registration');
  const [authLoading, setAuthLoading] = useState(true);

  // 通用的 API 请求封装，带 Token
  const fetchApi = async (url, options = {}) => {
    const headers = options.headers || {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(url, {
      ...options,
      headers
    });

    if (res.status === 401) {
      // 登录失效，清除 Token 并登出
      logout();
      throw new Error('登录已失效，请重新登录');
    }

    return res;
  };

  // 登出
  const logout = () => {
    localStorage.removeItem('hoops_token');
    localStorage.removeItem('hoops_manager_active_match_id');
    localStorage.removeItem('hoops_manager_live_match');
    setToken(null);
    setCurrentUser(null);
    setCurrentView('registration');
  };

  // 加载最新数据 store
  const loadStore = async () => {
    if (!token) return;
    try {
      const storeRes = await fetch('/api/store', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const storeJson = await storeRes.json();
      if (storeJson.success) {
        setStore(storeJson.data || { teams: [], tournament: null, pastTournaments: [] });
      }
    } catch (err) {
      console.error('加载最新数据 store 失败:', err);
    }
  };

  // 登录验证及 Bootstrap 加载
  useEffect(() => {
    const checkAuth = async () => {
      if (!token) {
        setAuthLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) {
          setCurrentUser(json.user);
          // 加载最新的数据 store
          await loadStore();
        } else {
          logout();
        }
      } catch (err) {
        console.error('身份校验失败，将降级使用空数据', err);
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [token]);

  // 保存全局数据并发送给后端（支持 403 错误处理与回滚）
  const saveStore = async (keyOrObj, value) => {
    let newStore;
    if (typeof keyOrObj === 'object' && keyOrObj !== null) {
      newStore = { ...store, ...keyOrObj };
    } else {
      newStore = {
        ...store,
        [keyOrObj]: value
      };
    }

    // 乐观更新：先在前端生效
    const oldStore = { ...store };
    setStore(newStore);

    try {
      const res = await fetchApi('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStore)
      });
      const json = await res.json();
      if (!json.success) {
        // 保存失败，回滚
        setStore(oldStore);
        alert(`保存数据失败: ${json.error}`);
      }
    } catch (err) {
      console.error('写入服务器数据库请求失败:', err);
      // 网络等原因导致失败，回滚
      setStore(oldStore);
      alert('无法保存至数据库，操作已被拦截或网络异常。');
    }
  };

  // 修改当前视图路由
  const switchView = (viewId) => {
    // 权限限制：如果未登录，不能切换视图
    if (!token) return;
    // 如果是非管理员，且视图是 users，则强切回 registration
    if (viewId === 'users' && (!currentUser || currentUser.role !== 'admin')) {
      setCurrentView('registration');
      localStorage.setItem('hoops_manager_current_view', 'registration');
      return;
    }
    setCurrentView(viewId);
    localStorage.setItem('hoops_manager_current_view', viewId);
  };

  return (
    <AppContext.Provider value={{
      token,
      setToken,
      currentUser,
      setCurrentUser,
      store,
      setStore,
      currentView,
      switchView,
      authLoading,
      fetchApi,
      saveStore,
      loadStore,
      logout
    }}>
      {children}
    </AppContext.Provider>
  );
};
