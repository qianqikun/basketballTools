import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import './Registration.css';

export default function Registration() {
  const { store, saveStore, currentUser } = useApp();
  const [teamName, setTeamName] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const teams = store.teams || [];
  const isAdmin = currentUser && currentUser.role === 'admin';

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = teamName.trim();
    if (!name) return;

    if (teams.some(t => t.name === name)) {
      alert('队伍名称已存在');
      return;
    }

    const newTeam = {
      id: 'team_' + Date.now(),
      name: name
    };

    saveStore('teams', [...teams, newTeam]);
    setTeamName('');
  };

  const handleDelete = (id) => {
    if (!isAdmin) {
      alert('权限不足，仅系统管理员可删除报名队伍！');
      return;
    }
    if (confirm('确定要删除该队伍吗？如果已开始抽签，可能会影响比赛进程。')) {
      const updatedTeams = teams.filter(t => t.id !== id);
      saveStore('teams', updatedTeams);
      // 清理选中状态
      setSelectedIds(selectedIds.filter(x => x !== id));
    }
  };

  // 全选/全不选
  const handleSelectAll = () => {
    if (selectedIds.length < teams.length) {
      setSelectedIds(teams.map(t => t.id));
    } else {
      setSelectedIds([]);
    }
  };

  // 单选/单选取消
  const handleSelectOne = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // 批量删除
  const handleBatchDelete = () => {
    if (!isAdmin) return;
    if (selectedIds.length === 0) return;

    if (confirm(`确定要批量删除这 ${selectedIds.length} 支球队吗？此操作不可撤销。`)) {
      const updatedTeams = teams.filter(t => !selectedIds.includes(t.id));
      saveStore('teams', updatedTeams);
      setSelectedIds([]);
    }
  };

  return (
    <section id="registration" className="view-section active" style={{ display: 'block' }}>
      <header className="section-header">
        <h1>报名管理</h1>
        <p>添加并管理参赛队伍，支持淘汰赛及多种循环赛制对阵。</p>
      </header>
      <div className="registration-container">
        <div className="add-team-card">
          <h3>添加新球队</h3>
          <form id="add-team-form" onSubmit={handleSubmit}>
            <input
              type="text"
              id="team-name"
              placeholder="球队名称"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
            />
            <button type="submit" className="primary-btn">
              <i className="bx bx-plus"></i> 添加
            </button>
          </form>
        </div>
        <div className="team-list-card">
          <div className="list-header">
            <h3>已报名球队</h3>
            <span className="team-count" id="team-count">
              已报名 {teams.length} 支
            </span>
          </div>

          {/* 批量操作控制栏 */}
          {isAdmin && teams.length > 0 && (
            <div className={`batch-actions-bar ${selectedIds.length > 0 ? 'has-selection' : ''}`}>
              <label className="select-all-label">
                <input 
                  type="checkbox" 
                  checked={selectedIds.length === teams.length && teams.length > 0} 
                  onChange={handleSelectAll} 
                />
                <span>全选</span>
              </label>
              <button 
                className={`danger-btn batch-delete-btn ${selectedIds.length === 0 ? 'disabled' : ''}`}
                disabled={selectedIds.length === 0}
                onClick={handleBatchDelete}
              >
                <i className="bx bx-trash"></i> 批量删除 ({selectedIds.length})
              </button>
            </div>
          )}

          {teams.length === 0 ? (
            <div className="empty-state">
              <i className="bx bx-box"></i>
              <h3>暂无报名球队</h3>
              <p>请先在左侧输入球队名称并添加以进行报名。</p>
            </div>
          ) : (
            <ul id="team-list" className="team-list">
              {teams.map((team) => {
                const isSelected = selectedIds.includes(team.id);
                return (
                  <li 
                    key={team.id} 
                    className={`team-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => isAdmin && handleSelectOne(team.id)}
                    style={{ cursor: isAdmin ? 'pointer' : 'default' }}
                  >
                    <div className="team-item-left" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {isAdmin && (
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={() => handleSelectOne(team.id)} // 绑定处理函数，修复直接点击 checkbox 状态不更新的 Bug
                          onClick={(e) => e.stopPropagation()} 
                        />
                      )}
                      <span className="team-name-text">{team.name}</span>
                    </div>
                    {isAdmin && (
                      <div className="team-item-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="delete-btn"
                          onClick={() => handleDelete(team.id)}
                        >
                          <i className="bx bx-trash"></i>
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
