import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import './Profile.css';

export default function Profile() {
  const { currentUser, setCurrentUser, fetchApi } = useApp();
  const [nickname, setNickname] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 错误提示状态
  const [nickError, setNickError] = useState('');
  const [oldPwdError, setOldPwdError] = useState('');
  const [newPwdError, setNewPwdError] = useState('');
  const [confirmPwdError, setConfirmPwdError] = useState('');

  useEffect(() => {
    if (currentUser) {
      setNickname(currentUser.nickname || '');
    }
  }, [currentUser]);

  // 校验逻辑
  const validateNickname = (val) => {
    if (!val) return '昵称不能为空';
    if (val.length < 2 || val.length > 10) return '昵称长度须在2至10位之间';
    return '';
  };

  const handleNicknameChange = (e) => {
    const val = e.target.value.trim();
    setNickname(val);
    setNickError(validateNickname(val));
  };

  // 密码校验逻辑
  const checkPasswords = (oldP, newP, confirmP) => {
    let oldErr = '';
    let newErr = '';
    let confirmErr = '';

    if (oldP || newP || confirmP) {
      if (!oldP) oldErr = '请输入当前密码';
      if (!newP) newErr = '请输入新密码';
      else if (newP.length < 6 || newP.length > 20) newErr = '密码长度须在6至20位之间';

      if (newP && confirmP && newP !== confirmP) {
        confirmErr = '两次输入的新密码不一致';
      } else if (!confirmP && newP) {
        confirmErr = '请确认新密码';
      }
    }

    setOldPwdError(oldErr);
    setNewPwdError(newErr);
    setConfirmPwdError(confirmErr);

    return { oldErr, newErr, confirmErr };
  };

  const handleOldPwdChange = (e) => {
    const val = e.target.value;
    setOldPassword(val);
    checkPasswords(val, newPassword, confirmPassword);
  };

  const handleNewPwdChange = (e) => {
    const val = e.target.value;
    setNewPassword(val);
    checkPasswords(oldPassword, val, confirmPassword);
  };

  const handleConfirmPwdChange = (e) => {
    const val = e.target.value;
    setConfirmPassword(val);
    checkPasswords(oldPassword, newPassword, val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const nickErr = validateNickname(nickname);
    setNickError(nickErr);

    const { oldErr, newErr, confirmErr } = checkPasswords(oldPassword, newPassword, confirmPassword);

    if (nickErr || oldErr || newErr || confirmErr) {
      return;
    }

    try {
      // 1. 修改昵称
      if (nickname !== currentUser.nickname) {
        const resNick = await fetchApi('/api/auth/update-nickname', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nickname })
        });
        const jsonNick = await resNick.json();
        if (!jsonNick.success) {
          alert(`昵称修改失败: ${jsonNick.error}`);
          return;
        }
        setCurrentUser({ ...currentUser, nickname });
      }

      // 2. 修改密码
      if (newPassword) {
        const resPwd = await fetchApi('/api/auth/update-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword, newPassword, confirmPassword })
        });
        const jsonPwd = await resPwd.json();
        if (!jsonPwd.success) {
          setOldPwdError(jsonPwd.error || '密码修改失败');
          return;
        }
      }

      alert('账户资料保存成功！');
      
      // 清空密码框
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error(err);
      alert('保存账户资料请求失败，请稍后重试');
    }
  };

  if (!currentUser) return null;

  return (
    <section id="profile" className="view-section active" style={{ display: 'block' }}>
      <header className="section-header">
        <h1>个人设置</h1>
        <p>修改您的系统昵称，或更改您的登录密码。</p>
      </header>
      <div className="profile-container">
        <div className="profile-card">
          <form id="profile-settings-form" onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label>用户名</label>
              <input
                type="text"
                id="profile-username"
                value={currentUser.username}
                readOnly
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--panel-border)'
                }}
              />
            </div>
            <div className="form-group">
              <label htmlFor="profile-nickname">昵称</label>
              <input
                type="text"
                id="profile-nickname"
                className={nickError ? 'invalid' : nickname ? 'valid' : ''}
                value={nickname}
                onChange={handleNicknameChange}
                required
                placeholder="请输入新昵称 (2-10位)"
              />
              <span className={`error-msg ${nickError ? 'visible' : ''}`} id="profile-nickname-error">
                {nickError}
              </span>
            </div>
            <div className="form-group-divider">
              <span>修改密码 (留空则不修改)</span>
            </div>
            <div className="form-group">
              <label htmlFor="profile-old-password">当前密码</label>
              <input
                type="password"
                id="profile-old-password"
                className={oldPwdError ? 'invalid' : oldPassword ? 'valid' : ''}
                value={oldPassword}
                onChange={handleOldPwdChange}
                placeholder="若要修改密码，请输入当前密码"
                autoComplete="current-password"
              />
              <span className={`error-msg ${oldPwdError ? 'visible' : ''}`} id="profile-old-password-error">
                {oldPwdError}
              </span>
            </div>
            <div className="form-group">
              <label htmlFor="profile-new-password">新密码</label>
              <input
                type="password"
                id="profile-new-password"
                className={newPwdError ? 'invalid' : newPassword ? 'valid' : ''}
                value={newPassword}
                onChange={handleNewPwdChange}
                placeholder="6-20位新密码"
                autoComplete="new-password"
              />
              <span className={`error-msg ${newPwdError ? 'visible' : ''}`} id="profile-new-password-error">
                {newPwdError}
              </span>
            </div>
            <div className="form-group">
              <label htmlFor="profile-confirm-password">确认新密码</label>
              <input
                type="password"
                id="profile-confirm-password"
                className={confirmPwdError ? 'invalid' : confirmPassword ? 'valid' : ''}
                value={confirmPassword}
                onChange={handleConfirmPwdChange}
                placeholder="请再次输入新密码"
                autoComplete="new-password"
              />
              <span className={`error-msg ${confirmPwdError ? 'visible' : ''}`} id="profile-confirm-password-error">
                {confirmPwdError}
              </span>
            </div>
            <button type="submit" className="primary-btn profile-submit-btn">
              <i className="bx bx-check-circle"></i> 保存更改
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
