import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import './Registration.css';

export default function Registration() {
  const { store, saveStore, currentUser } = useApp();
  const [teamName, setTeamName] = useState('');

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
    }
  };

  return (
    <section id="registration" className="view-section active" style={{ display: 'block' }}>
      <header className="section-header">
        <h1>报名管理</h1>
        <p>添加并管理参赛队伍，支持8支或16支队伍单败淘汰。</p>
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
              {teams.length}/16
            </span>
          </div>
          {teams.length === 0 ? (
            <div className="empty-state">
              <i className="bx bx-box"></i>
              <h3>暂无报名球队</h3>
              <p>请先在左侧输入球队名称并添加以进行报名。</p>
            </div>
          ) : (
            <ul id="team-list" className="team-list">
              {teams.map((team) => (
                <li key={team.id} className="team-item">
                  <span>{team.name}</span>
                  {isAdmin && (
                    <div className="team-item-actions">
                      <button
                        className="delete-btn"
                        onClick={() => handleDelete(team.id)}
                      >
                        <i className="bx bx-trash"></i>
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
