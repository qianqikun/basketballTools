import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from './context/AppContext';
import { useWebSocket } from './context/WebSocketContext';

// 视图组件引入
import Registration from './views/Registration';
import DrawView from './views/DrawView';
import MatchConsole from './views/MatchConsole';
import HistoryView from './views/HistoryView';
import LiveViewer from './views/LiveViewer';
import Profile from './views/Profile';
import UsersPanel from './views/UsersPanel';

export default function App() {
  const {
    token,
    setToken,
    currentUser,
    setCurrentUser,
    store,
    saveStore,
    authLoading,
    logout
  } = useApp();

  const { sendWsMessage } = useWebSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  // 移动端菜单开关
  const [menuOpen, setMenuOpen] = useState(false);

  // 登录/注册表单状态切换
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'

  // 登录输入
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // 注册输入及实时校验提示
  const [regUsername, setRegUsername] = useState('');
  const [regNickname, setRegNickname] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const [regUserErr, setRegUserErr] = useState('');
  const [regNickErr, setRegNickErr] = useState('');
  const [regPassErr, setRegPassErr] = useState('');
  const [regConfirmErr, setRegConfirmErr] = useState('');

  // 当前执裁的比赛对象
  const [activeMatch, setActiveMatch] = useState(null);

  // 1. 根据缓存恢复上次比赛状态
  useEffect(() => {
    const activeMatchId = localStorage.getItem('hoops_manager_active_match_id');
    if (activeMatchId && store.tournament && store.tournament.currentMatches) {
      const match = store.tournament.currentMatches.find(m => m.id === activeMatchId);
      if (match && !match.completed) {
        setActiveMatch(match);
      }
    }
  }, [store.tournament]);

  // 2. 智能重定向和路径记忆
  useEffect(() => {
    if (token && currentPath === '/') {
      const savedView = localStorage.getItem('hoops_manager_current_view') || 'registration';
      // 安全保护：若上次记录为管理员页面，而当前并非管理员，强切回报名
      if (savedView === 'users' && (!currentUser || currentUser.role !== 'admin')) {
        navigate('/registration', { replace: true });
      } else {
        navigate(`/${savedView}`, { replace: true });
      }
    }
  }, [token, currentPath]);

  useEffect(() => {
    if (token && currentPath !== '/' && currentPath !== '') {
      const view = currentPath.substring(1);
      localStorage.setItem('hoops_manager_current_view', view);
    }
  }, [currentPath, token]);

  // 3. 彩蛋及全局重置逻辑
  const logoClickCountRef = useRef(0);
  const logoClickTimerRef = useRef(null);

  const handleLogoClick = () => {
    logoClickCountRef.current++;
    clearTimeout(logoClickTimerRef.current);
    logoClickTimerRef.current = setTimeout(() => {
      logoClickCountRef.current = 0;
    }, 3000);

    if (logoClickCountRef.current >= 5) {
      logoClickCountRef.current = 0;
      const code = prompt('🔑 进入系统高级控制：请输入管理员重置暗号：');
      if (code === 'admin') {
        if (!currentUser || currentUser.role !== 'admin') {
          alert('❌ 权限不足！您必须使用系统管理员账号登录，才能执行高级重置操作！');
          return;
        }
        triggerResetAll();
      } else if (code !== null) {
        alert('❌ 暗号错误，无权进行重置操作！');
      }
    }
  };

  const triggerResetAll = async () => {
    if (!currentUser || currentUser.role !== 'admin') {
      alert('权限不足，仅系统管理员可执行重置操作！');
      return;
    }
    if (confirm('警告：这将会清除所有报名队伍和比赛记录！确定要继续吗？')) {
      await saveStore({
        teams: [],
        tournament: null,
        pastTournaments: []
      });
      localStorage.removeItem('hoops_manager_current_view');
      localStorage.removeItem('hoops_manager_active_match_id');
      localStorage.removeItem('hoops_manager_live_match');
      sendWsMessage('MATCH_END', {}); // 清除同步比分
      
      alert('所有数据已成功重置！');
      setTimeout(() => navigate('/registration'), 300);
    }
  };

  // 4. 登录提交流程
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword })
      });
      const json = await res.json();
      if (json.success && json.token) {
        localStorage.setItem('hoops_token', json.token);
        setToken(json.token);
        setCurrentUser(json.user);
        navigate('/registration');
      } else {
        alert(`登录失败: ${json.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('登录请求失败，请稍后重试');
    }
  };

  // 5. 注册实时校验
  const validateUsername = (val) => {
    const regex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!val) return '用户名不能为空';
    if (!regex.test(val)) return '用户名须为3-20位英文、数字或下划线';
    return '';
  };

  const validateNickname = (val) => {
    if (!val) return '昵称不能为空';
    if (val.length < 2 || val.length > 10) return '昵称长度须在2至10位之间';
    return '';
  };

  const validatePassword = (val) => {
    if (!val) return '密码不能为空';
    if (val.length < 6 || val.length > 20) return '密码长度须在6至20位之间';
    return '';
  };

  const validateConfirmPassword = (val, pwd) => {
    if (!val) return '请再次输入密码以确认';
    if (val !== pwd) return '两次输入的密码不一致';
    return '';
  };

  const handleRegUserChange = (e) => {
    const val = e.target.value.trim();
    setRegUsername(val);
    setRegUserErr(validateUsername(val));
  };

  const handleRegNickChange = (e) => {
    const val = e.target.value.trim();
    setRegNickname(val);
    setRegNickErr(validateNickname(val));
  };

  const handleRegPassChange = (e) => {
    const val = e.target.value;
    setRegPassword(val);
    setRegPassErr(validatePassword(val));
    if (regConfirm) {
      setRegConfirmErr(validateConfirmPassword(regConfirm, val));
    }
  };

  const handleRegConfirmChange = (e) => {
    const val = e.target.value;
    setRegConfirm(val);
    setRegConfirmErr(validateConfirmPassword(val, regPassword));
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    const errUser = validateUsername(regUsername);
    const errNick = validateNickname(regNickname);
    const errPass = validatePassword(regPassword);
    const errConfirm = validateConfirmPassword(regConfirm, regPassword);

    setRegUserErr(errUser);
    setRegNickErr(errNick);
    setRegPassErr(errPass);
    setRegConfirmErr(errConfirm);

    if (errUser || errNick || errPass || errConfirm) return;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername.trim(),
          nickname: regNickname.trim(),
          password: regPassword,
          confirmPassword: regConfirm
        })
      });
      const json = await res.json();
      if (json.success) {
        // 自动登录
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: regUsername.trim(), password: regPassword })
        });
        const loginJson = await loginRes.json();
        if (loginJson.success && loginJson.token) {
          localStorage.setItem('hoops_token', loginJson.token);
          setToken(loginJson.token);
          setCurrentUser(loginJson.user);
          navigate('/registration');
        } else {
          alert('注册成功，但自动登录失败，请手动登录');
          setAuthMode('login');
        }
      } else {
        if (json.error && json.error.includes('已存在')) {
          setRegUserErr('用户名已存在，请换一个');
        } else {
          alert(`注册失败: ${json.error}`);
        }
      }
    } catch (err) {
      console.error(err);
      alert('注册请求失败，请稍后重试');
    }
  };

  // 退出登录
  const handleLogoutClick = () => {
    if (confirm('确定要退出当前登录账号吗？')) {
      logout();
      window.location.reload();
    }
  };

  // 导航项点击
  const handleNavItemClick = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  // 锦标赛卡片点击“进入比赛”
  const handleStartMatch = (match) => {
    setActiveMatch(match);
    localStorage.setItem('hoops_manager_active_match_id', match.id);
    navigate('/match');
  };

  // 返回锦标赛
  const handleBackToDraw = () => {
    setActiveMatch(null);
    localStorage.removeItem('hoops_manager_active_match_id');
    navigate('/tournament');
  };

  // 加载中渲染
  if (authLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#0f172a',
        color: '#fff'
      }}>
        <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '3rem', color: 'var(--primary-color)', marginBottom: '1rem' }}></i>
        <h2>正在初始化服务...</h2>
      </div>
    );
  }

  // 5. 未登录状态：渲染 Auth Container 遮罩层
  if (!token) {
    return (
      <div id="auth-container" className="auth-container" style={{ display: 'flex' }}>
        <div className="auth-card">
          <div className="auth-logo">
            <i className="bx bxs-basketball"></i>
            <div className="auth-logo-text">
              <h2>HoopsManager</h2>
              <p>篮球比赛管理与实时同步工具</p>
            </div>
          </div>

          {authMode === 'login' ? (
            <div id="login-form-wrapper" className="auth-form-wrapper">
              <h3>登录账户</h3>
              <form id="login-form" onSubmit={handleLoginSubmit}>
                <div className="form-group">
                  <label htmlFor="login-username">用户名</label>
                  <input
                    type="text"
                    id="login-username"
                    required
                    placeholder="请输入用户名"
                    autoComplete="username"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="login-password">密码</label>
                  <input
                    type="password"
                    id="login-password"
                    required
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
                <button type="submit" className="primary-btn auth-btn">
                  立即登录
                </button>
              </form>
              <div className="auth-switch">
                没有账号？ <a href="#" onClick={(e) => { e.preventDefault(); setAuthMode('register'); }}>去注册</a>
              </div>
            </div>
          ) : (
            <div id="register-form-wrapper" className="auth-form-wrapper">
              <h3>注册账号</h3>
              <div className="notice-box">
                <i className="bx bx-info-circle"></i>
                <span>规则: 用户名3-20位(英/数/_), 昵称2-10位, 密码6-20位</span>
              </div>
              <form id="register-form" onSubmit={handleRegisterSubmit} noValidate>
                <div className="form-group">
                  <label htmlFor="register-username">用户名</label>
                  <input
                    type="text"
                    id="register-username"
                    className={regUserErr ? 'invalid' : regUsername ? 'valid' : ''}
                    required
                    placeholder="3-20位英文、数字或下划线"
                    autoComplete="username"
                    value={regUsername}
                    onChange={handleRegUserChange}
                  />
                  <span className={`error-msg ${regUserErr ? 'visible' : ''}`}>{regUserErr}</span>
                </div>
                <div className="form-group">
                  <label htmlFor="register-nickname">昵称</label>
                  <input
                    type="text"
                    id="register-nickname"
                    className={regNickErr ? 'invalid' : regNickname ? 'valid' : ''}
                    required
                    placeholder="2-10位字符，用于弹幕及执裁"
                    autoComplete="nickname"
                    value={regNickname}
                    onChange={handleRegNickChange}
                  />
                  <span className={`error-msg ${regNickErr ? 'visible' : ''}`}>{regNickErr}</span>
                </div>
                <div className="form-group">
                  <label htmlFor="register-password">密码</label>
                  <input
                    type="password"
                    id="register-password"
                    className={regPassErr ? 'invalid' : regPassword ? 'valid' : ''}
                    required
                    placeholder="6-20位密码"
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={handleRegPassChange}
                  />
                  <span className={`error-msg ${regPassErr ? 'visible' : ''}`}>{regPassErr}</span>
                </div>
                <div className="form-group">
                  <label htmlFor="register-confirm-password">确认密码</label>
                  <input
                    type="password"
                    id="register-confirm-password"
                    className={regConfirmErr ? 'invalid' : regConfirm ? 'valid' : ''}
                    required
                    placeholder="请再次输入密码以确认"
                    autoComplete="new-password"
                    value={regConfirm}
                    onChange={handleRegConfirmChange}
                  />
                  <span className={`error-msg ${regConfirmErr ? 'visible' : ''}`}>{regConfirmErr}</span>
                </div>
                <button type="submit" className="primary-btn auth-btn">
                  注册并登录
                </button>
              </form>
              <div className="auth-switch">
                已有账号？ <a href="#" onClick={(e) => { e.preventDefault(); setAuthMode('login'); }}>立即登录</a>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 6. 已登录状态：渲染主 App 布局与子路由分发
  const isAdmin = currentUser && currentUser.role === 'admin';

  return (
    <div className="app-container">
      {/* 侧边栏 */}
      <aside className="sidebar">
        <div className="logo" onClick={handleLogoClick} style={{ cursor: 'pointer' }}>
          <i className="bx bxs-basketball"></i>
          <span>HoopsManager</span>
        </div>
        <button id="menu-toggle-btn" className="menu-toggle-btn" onClick={() => setMenuOpen(!menuOpen)}>
          <i className="bx bx-menu"></i>
        </button>
        <nav className={`nav-menu ${menuOpen ? 'open' : ''}`}>
          <button className={`nav-item ${currentPath === '/registration' ? 'active' : ''}`} onClick={() => handleNavItemClick('/registration')}>
            <i className="bx bx-user-plus"></i> 报名管理
          </button>
          <button className={`nav-item ${currentPath === '/tournament' ? 'active' : ''}`} onClick={() => handleNavItemClick('/tournament')}>
            <i className="bx bx-git-merge"></i> 抽签对阵
          </button>
          <button className={`nav-item ${currentPath === '/match' ? 'active' : ''}`} onClick={() => handleNavItemClick('/match')}>
            <i className="bx bx-timer"></i> 实时记分
          </button>
          <button className={`nav-item ${currentPath === '/history' ? 'active' : ''}`} onClick={() => handleNavItemClick('/history')}>
            <i className="bx bx-history"></i> 赛程记录
          </button>
          <button className={`nav-item ${currentPath === '/live' ? 'active' : ''}`} onClick={() => handleNavItemClick('/live')}>
            <i className="bx bx-broadcast"></i> 实时观战
          </button>
          <button className={`nav-item ${currentPath === '/profile' ? 'active' : ''}`} onClick={() => handleNavItemClick('/profile')}>
            <i className="bx bx-user-pin"></i> 个人设置
          </button>
          {isAdmin && (
            <button className={`nav-item ${currentPath === '/users' ? 'active' : ''}`} onClick={() => handleNavItemClick('/users')}>
              <i className="bx bx-group"></i> 用户管理
            </button>
          )}
          {/* 移动端专属：退出登录按钮 */}
          <div className="mobile-only nav-divider"></div>
          <button className="mobile-only danger-btn" onClick={handleLogoutClick}>
            <i className="bx bx-log-out"></i> 退出登录
          </button>
          {isAdmin && (
            <button className="mobile-only danger-btn" onClick={triggerResetAll}>
              <i className="bx bx-reset"></i> 重置所有数据
            </button>
          )}
        </nav>
        <div className="sidebar-footer">
          {currentUser && (
            <div className="current-user-info" style={{ display: 'flex' }}>
              <i className="bx bx-user-circle"></i>
              <div className="user-meta">
                <span className="user-nickname">{currentUser.nickname}</span>
                <span className="user-role">{isAdmin ? '管理员' : '球员'}</span>
              </div>
            </div>
          )}
          <button className="danger-btn" style={{ marginTop: '0.5rem' }} onClick={handleLogoutClick}>
            <i className="bx bx-log-out"></i> 退出登录
          </button>
          {isAdmin && (
            <button className="danger-btn" onClick={triggerResetAll}>
              <i className="bx bx-reset"></i> 重置所有数据
            </button>
          )}
        </div>
      </aside>

      {/* 主视图显示区 (使用 Routes / Route) */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/registration" replace />} />
          <Route path="/registration" element={<Registration />} />
          <Route path="/tournament" element={<DrawView onStartMatch={handleStartMatch} />} />
          <Route path="/match" element={<MatchConsole match={activeMatch} onBack={handleBackToDraw} />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/live" element={<LiveViewer />} />
          <Route path="/profile" element={<Profile />} />
          {isAdmin ? (
            <Route path="/users" element={<UsersPanel />} />
          ) : (
            <Route path="/users" element={<Navigate to="/registration" replace />} />
          )}
          {/* 兜底 404 */}
          <Route path="*" element={<Navigate to="/registration" replace />} />
        </Routes>
      </main>
    </div>
  );
}
