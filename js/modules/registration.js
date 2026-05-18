export class RegistrationModule {
  constructor(app) {
    this.app = app;
    this.form = document.getElementById('add-team-form');
    this.input = document.getElementById('team-name');
    this.list = document.getElementById('team-list');
    this.count = document.getElementById('team-count');
    
    this.bindEvents();
    this.render();
  }

  bindEvents() {
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = this.input.value.trim();
      if (name) {
        this.addTeam(name);
        this.input.value = '';
      }
    });

    this.list.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn')) {
        const id = e.target.closest('.delete-btn').dataset.id;
        this.deleteTeam(id);
      }
    });
  }

  addTeam(name) {
    const teams = this.app.store.teams || [];
    // 检查是否已经存在
    if (teams.some(t => t.name === name)) {
      alert('队伍名称已存在');
      return;
    }
    
    const newTeam = {
      id: 'team_' + Date.now(),
      name: name
    };
    
    teams.push(newTeam);
    this.app.saveStore('teams', teams);
    this.render();
  }

  deleteTeam(id) {
    if (confirm('确定要删除该队伍吗？如果已开始抽签，可能会影响比赛进程。')) {
      let teams = this.app.store.teams || [];
      teams = teams.filter(t => t.id !== id);
      this.app.saveStore('teams', teams);
      this.render();
    }
  }

  render() {
    const teams = this.app.store.teams || [];
    this.count.textContent = `${teams.length}`;
    
    if (teams.length === 0) {
      this.list.innerHTML = `<li class="empty-state" style="padding:2rem;">暂无报名球队</li>`;
      return;
    }
    
    this.list.innerHTML = teams.map(team => `
      <li class="team-item">
        <span>${team.name}</span>
        <div class="team-item-actions">
          <button class="delete-btn" data-id="${team.id}"><i class='bx bx-trash'></i></button>
        </div>
      </li>
    `).join('');
  }
}
