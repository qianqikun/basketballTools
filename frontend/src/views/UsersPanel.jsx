import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import './UsersPanel.css';

export default function UsersPanel() {
  const { currentUser, setCurrentUser, fetchApi } = useApp();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 模态弹窗状态
  const [activeModal, setActiveModal] = useState(null); // 'password' | 'nickname' | null
  const [selectedUser, setSelectedUser] = useState(null);

  // 模态表单输入状态
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newNickname, setNewNickname] = useState('');

  const loadUserList = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApi('/api/users');
      const json = await res.json();
      if (json.success) {
        setUsers(json.users || []);
      } else {
        setError(json.error || '加载失败');
      }
    } catch (err) {
      console.error(err);
      setError('连接服务器失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserList();
  }, []);

  const handleDelete = async (user) => {
    if (!confirm(`确定要彻底删除用户 [${user.username}] 吗？删除后此账户将无法登录。`)) {
      return;
    }
    try {
      const res = await fetchApi('/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      const json = await res.json();
      if (json.success) {
        alert('删除成功');
        loadUserList();
      } else {
        alert(`删除失败: ${json.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('请求删除失败，请稍后重试');
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6 || newPassword.length > 20) {
      alert('新密码长度须在6至20位之间');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('两次输入的密码不一致');
      return;
    }
    try {
      const res = await fetchApi('/api/users/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, newPassword, confirmPassword })
      });
      const json = await res.json();
      if (json.success) {
        alert('密码修改成功');
        closeModals();
      } else {
        alert(`修改失败: ${json.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('修改密码请求失败，请稍后重试');
    }
  };

  const handleUpdateNickname = async (e) => {
    e.preventDefault();
    const nicknameVal = newNickname.trim();
    if (nicknameVal.length < 2 || nicknameVal.length > 10) {
      alert('新昵称长度须在2至10个字符之间');
      return;
    }
    try {
      const res = await fetchApi('/api/users/update-nickname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, newNickname: nicknameVal })
      });
      const json = await res.json();
      if (json.success) {
        alert('昵称修改成功');
        if (currentUser && currentUser.username === selectedUser.username) {
          setCurrentUser({ ...currentUser, nickname: nicknameVal });
        }
        closeModals();
        loadUserList();
      } else {
        alert(`修改失败: ${json.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('修改昵称请求失败，请稍后重试');
    }
  };

  const openPasswordModal = (user) => {
    setSelectedUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setActiveModal('password');
  };

  const openNicknameModal = (user) => {
    setSelectedUser(user);
    setNewNickname(user.nickname || '');
    setActiveModal('nickname');
  };

  const closeModals = () => {
    setActiveModal(null);
    setSelectedUser(null);
  };

  const currentUsername = currentUser ? currentUser.username : null;

  return (
    <section id="users" className="view-section active" style={{ display: 'block' }}>
      <header className="section-header">
        <h1>用户管理</h1>
        <p>管理系统内的裁判和管理员账户，支持修改密码、删除用户等操作。</p>
      </header>
      <div className="users-container">
        <div className="user-list-card">
          <div className="list-header" style={{ marginBottom: '1.5rem' }}>
            <h3>系统账号列表</h3>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}></i>
              <br />正在加载用户...
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--danger)' }}>
              加载失败: {error}
            </div>
          ) : (
            <>
              {/* 桌面端表格 */}
              <div className="table-responsive">
                <table className="user-table" id="user-table">
                  <thead>
                    <tr>
                      <th>用户名</th>
                      <th>昵称</th>
                      <th>角色</th>
                      <th>创建时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody id="user-list-tbody">
                    {users.map((user) => {
                      const roleText = user.role === 'admin' ? '管理员' : '球员';
                      const dateStr = user.created_at ? new Date(user.created_at).toLocaleString() : '-';
                      const isSelf = user.username === currentUsername;

                      return (
                        <tr key={user.id}>
                          <td>
                            {user.username}
                            {isSelf && (
                              <span style={{ color: 'var(--primary-color)', fontSize: '0.8rem', marginLeft: '0.25rem' }}>
                                (我自己)
                              </span>
                            )}
                          </td>
                          <td>{user.nickname}</td>
                          <td>
                            <span className={`role-badge ${user.role}`}>{roleText}</span>
                          </td>
                          <td>{dateStr}</td>
                          <td>
                            <div className="action-btns">
                              <button className="secondary-btn edit-nickname-btn" onClick={() => openNicknameModal(user)}>
                                <i className="bx bx-edit-alt"></i> 修改昵称
                              </button>
                              <button className="secondary-btn edit-pw-btn" onClick={() => openPasswordModal(user)}>
                                <i className="bx bx-key"></i> 修改密码
                              </button>
                              {!isSelf && (
                                <button className="danger-btn delete-user-btn" style={{ width: 'auto' }} onClick={() => handleDelete(user)}>
                                  <i className="bx bx-trash"></i> 删除
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 移动端卡片列表 */}
              <div className="user-cards-grid" id="user-cards-mobile">
                {users.map((user) => {
                  const roleText = user.role === 'admin' ? '管理员' : '球员';
                  const dateStr = user.created_at ? new Date(user.created_at).toLocaleString() : '-';
                  const isSelf = user.username === currentUsername;

                  return (
                    <div key={user.id} className="user-mobile-card">
                      <div className="user-mobile-header">
                        <span className="user-mobile-name">
                          {user.username}
                          {isSelf && <span style={{ color: 'var(--primary-color)', fontSize: '0.75rem' }}>(我)</span>}
                        </span>
                        <span className={`role-badge ${user.role}`}>{roleText}</span>
                      </div>
                      <div className="user-mobile-row">
                        <span>昵称:</span>
                        <span>{user.nickname}</span>
                      </div>
                      <div className="user-mobile-row">
                        <span>创建时间:</span>
                        <span>{dateStr}</span>
                      </div>
                      <div className="user-mobile-actions">
                        <button className="secondary-btn edit-nickname-btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => openNicknameModal(user)}>
                          <i className="bx bx-edit-alt"></i> 改昵称
                        </button>
                        <button className="secondary-btn edit-pw-btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => openPasswordModal(user)}>
                          <i className="bx bx-key"></i> 改密
                        </button>
                        {!isSelf && (
                          <button className="danger-btn delete-user-btn" style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleDelete(user)}>
                            <i className="bx bx-trash"></i> 删除
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 修改密码模态窗 */}
      {activeModal === 'password' && selectedUser && (
        <div id="password-modal" className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal-card">
            <div className="modal-header">
              <h3>修改用户密码</h3>
              <button className="modal-close-btn" onClick={closeModals}><i className="bx bx-x"></i></button>
            </div>
            <form id="update-password-form" onSubmit={handleUpdatePassword}>
              <div className="form-group">
                <label>用户名</label>
                <input type="text" value={selectedUser.username} readOnly style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--panel-border)' }} />
              </div>
              <div className="form-group">
                <label htmlFor="new-password">新密码 <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(6-20位)</span></label>
                <input type="password" id="new-password" required placeholder="请输入新密码" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength="6" maxLength="20" />
              </div>
              <div className="form-group">
                <label htmlFor="confirm-new-password">确认新密码</label>
                <input type="password" id="confirm-new-password" required placeholder="请再次输入新密码" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength="6" maxLength="20" />
              </div>
              <div className="modal-footer">
                <button type="button" className="secondary-btn" onClick={closeModals}>取消</button>
                <button type="submit" className="primary-btn">确认修改</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 修改昵称模态窗 */}
      {activeModal === 'nickname' && selectedUser && (
        <div id="nickname-modal" className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal-card">
            <div className="modal-header">
              <h3>修改用户昵称</h3>
              <button className="modal-close-btn" onClick={closeModals}><i className="bx bx-x"></i></button>
            </div>
            <form id="update-nickname-form" onSubmit={handleUpdateNickname}>
              <div className="form-group">
                <label>用户名</label>
                <input type="text" value={selectedUser.username} readOnly style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--panel-border)' }} />
              </div>
              <div className="form-group">
                <label htmlFor="new-nickname">新昵称 <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(2-10位)</span></label>
                <input type="text" id="new-nickname" required placeholder="请输入新昵称" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} autoComplete="nickname" minLength="2" maxLength="10" />
              </div>
              <div className="modal-footer">
                <button type="button" className="secondary-btn" onClick={closeModals}>取消</button>
                <button type="submit" className="primary-btn">确认修改</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
