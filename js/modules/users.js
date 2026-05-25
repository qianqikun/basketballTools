export class UsersModule {
  constructor(app) {
    this.app = app;
    
    // DOM 元素
    this.tbody = document.getElementById('user-list-tbody');
    this.mobileGrid = document.getElementById('user-cards-mobile');
    
    // 密码模态框
    this.modal = document.getElementById('password-modal');
    this.modalForm = document.getElementById('update-password-form');
    this.modalUserId = document.getElementById('update-password-userid');
    this.modalUsername = document.getElementById('update-password-username');
    this.modalNewPass = document.getElementById('new-password');
    this.modalConfirmPass = document.getElementById('confirm-new-password');
    
    this.closeModalBtn = document.getElementById('close-password-modal');
    this.cancelModalBtn = document.getElementById('cancel-password-modal');

    // 昵称模态框
    this.nicknameModal = document.getElementById('nickname-modal');
    this.nicknameForm = document.getElementById('update-nickname-form');
    this.nicknameUserId = document.getElementById('update-nickname-userid');
    this.nicknameUsername = document.getElementById('update-nickname-username');
    this.nicknameInput = document.getElementById('new-nickname');
    
    this.closeNicknameBtn = document.getElementById('close-nickname-modal');
    this.cancelNicknameBtn = document.getElementById('cancel-nickname-modal');
    
    this.bindEvents();
  }

  bindEvents() {
    // 关闭密码弹窗
    if (this.closeModalBtn) {
      this.closeModalBtn.addEventListener('click', () => this.hidePasswordModal());
    }
    if (this.cancelModalBtn) {
      this.cancelModalBtn.addEventListener('click', () => this.hidePasswordModal());
    }

    // 关闭昵称弹窗
    if (this.closeNicknameBtn) {
      this.closeNicknameBtn.addEventListener('click', () => this.hideNicknameModal());
    }
    if (this.cancelNicknameBtn) {
      this.cancelNicknameBtn.addEventListener('click', () => this.hideNicknameModal());
    }

    // 提交修改密码
    if (this.modalForm) {
      this.modalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = this.modalUserId.value;
        const newPassword = this.modalNewPass.value;
        const confirmPassword = this.modalConfirmPass.value;

        if (newPassword.length < 6 || newPassword.length > 20) {
          alert('新密码长度须在6至20位之间');
          return;
        }

        if (newPassword !== confirmPassword) {
          alert('两次输入的密码不一致');
          return;
        }

        try {
          const res = await this.app.fetchApi('/api/users/update-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, newPassword, confirmPassword })
          });
          const json = await res.json();
          if (json.success) {
            alert('密码修改成功');
            this.hidePasswordModal();
          } else {
            alert(`修改失败: ${json.error}`);
          }
        } catch (err) {
          console.error(err);
          alert('修改密码请求失败，请稍后重试');
        }
      });
    }

    // 提交修改昵称
    if (this.nicknameForm) {
      this.nicknameForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = this.nicknameUserId.value;
        const newNickname = this.nicknameInput.value.trim();

        if (newNickname.length < 2 || newNickname.length > 10) {
          alert('新昵称长度须在2至10个字符之间');
          return;
        }

        try {
          const res = await this.app.fetchApi('/api/users/update-nickname', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, newNickname })
          });
          const json = await res.json();
          if (json.success) {
            alert('昵称修改成功');
            
            // 如果修改的是当前登录用户自己，在前端做一次全局同步
            if (this.app.currentUser && this.app.currentUser.username === this.nicknameUsername.value) {
              this.app.currentUser.nickname = newNickname;
              const nicknameDisplay = document.getElementById('user-nickname-display');
              if (nicknameDisplay) nicknameDisplay.textContent = newNickname;
            }

            this.hideNicknameModal();
            this.loadUserList(); // 重新渲染列表
          } else {
            alert(`修改失败: ${json.error}`);
          }
        } catch (err) {
          console.error(err);
          alert('修改昵称请求失败，请稍后重试');
        }
      });
    }

    // 绑定表格操作按钮点击事件（利用事件委托）
    if (this.tbody) {
      this.tbody.addEventListener('click', (e) => this.handleActionClick(e));
    }
    if (this.mobileGrid) {
      this.mobileGrid.addEventListener('click', (e) => this.handleActionClick(e));
    }
  }

  handleActionClick(e) {
    const editBtn = e.target.closest('.edit-pw-btn');
    const editNicknameBtn = e.target.closest('.edit-nickname-btn');
    const deleteBtn = e.target.closest('.delete-user-btn');

    if (editBtn) {
      const id = editBtn.dataset.id;
      const username = editBtn.dataset.username;
      this.showPasswordModal(id, username);
    } else if (editNicknameBtn) {
      const id = editNicknameBtn.dataset.id;
      const username = editNicknameBtn.dataset.username;
      const nickname = editNicknameBtn.dataset.nickname;
      this.showNicknameModal(id, username, nickname);
    } else if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const username = deleteBtn.dataset.username;
      this.deleteUser(id, username);
    }
  }

  showPasswordModal(userId, username) {
    if (!this.modal) return;
    this.modalUserId.value = userId;
    this.modalUsername.value = username;
    this.modalNewPass.value = '';
    this.modalConfirmPass.value = '';
    this.modal.style.display = 'flex';
  }

  hidePasswordModal() {
    if (!this.modal) return;
    this.modal.style.display = 'none';
  }

  showNicknameModal(userId, username, nickname) {
    if (!this.nicknameModal) return;
    this.nicknameUserId.value = userId;
    this.nicknameUsername.value = username;
    this.nicknameInput.value = nickname || '';
    this.nicknameModal.style.display = 'flex';
  }

  hideNicknameModal() {
    if (!this.nicknameModal) return;
    this.nicknameModal.style.display = 'none';
  }

  async deleteUser(userId, username) {
    if (!confirm(`确定要彻底删除用户 [${username}] 吗？删除后此账户将无法登录。`)) {
      return;
    }

    try {
      const res = await this.app.fetchApi('/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const json = await res.json();
      if (json.success) {
        alert('删除成功');
        this.loadUserList(); // 重新加载列表
      } else {
        alert(`删除失败: ${json.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('请求删除失败，请稍后重试');
    }
  }

  async loadUserList() {
    if (!this.tbody || !this.mobileGrid) return;
    
    // 渲染加载中
    this.tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-secondary);"><i class='bx bx-loader-alt bx-spin' style='font-size: 1.5rem; margin-bottom: 0.5rem;'></i><br>正在加载用户...</td></tr>`;
    this.mobileGrid.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);"><i class='bx bx-loader-alt bx-spin' style='font-size: 1.5rem; margin-bottom: 0.5rem;'></i><br>正在加载用户...</div>`;
    
    try {
      const res = await this.app.fetchApi('/api/users');
      const json = await res.json();
      
      if (!json.success) {
        this.tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--danger);">加载失败: ${json.error}</td></tr>`;
        this.mobileGrid.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--danger);">加载失败: ${json.error}</div>`;
        return;
      }

      const users = json.users || [];
      this.renderUsers(users);
    } catch (err) {
      console.error(err);
      this.tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--danger);">连接服务器失败</td></tr>`;
      this.mobileGrid.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--danger);">连接服务器失败</div>`;
    }
  }

  renderUsers(users) {
    const currentUserId = this.app.currentUser ? this.app.currentUser.id : null;
    const currentUsername = this.app.currentUser ? this.app.currentUser.username : null;

    if (users.length === 0) {
      this.tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-secondary);"><i class='bx bx-loader-alt bx-spin' style='font-size: 1.5rem; margin-bottom: 0.5rem;'></i><br>暂无其他注册用户</td></tr>`;
      this.mobileGrid.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);"><i class='bx bx-loader-alt bx-spin' style='font-size: 1.5rem; margin-bottom: 0.5rem;'></i><br>暂无其他注册用户</div>`;
      return;
    }

    // 1. 渲染桌面表格
    this.tbody.innerHTML = users.map(user => {
      const roleText = user.role === 'admin' ? '管理员' : '球员';
      const dateStr = this.formatDateTime(user.created_at);
      const isSelf = user.username === currentUsername;
      
      return `
        <tr>
          <td>${user.username} ${isSelf ? '<span style="color: var(--primary-color); font-size: 0.8rem; margin-left: 0.25rem;">(我自己)</span>' : ''}</td>
          <td>${user.nickname}</td>
          <td><span class="role-badge ${user.role}">${roleText}</span></td>
          <td>${dateStr}</td>
          <td>
            <div class="action-btns">
              <button class="secondary-btn edit-nickname-btn" data-id="${user.id}" data-username="${user.username}" data-nickname="${user.nickname}"><i class='bx bx-edit-alt'></i> 修改昵称</button>
              <button class="secondary-btn edit-pw-btn" data-id="${user.id}" data-username="${user.username}"><i class='bx bx-key'></i> 修改密码</button>
              ${isSelf ? '' : `<button class="danger-btn delete-user-btn" data-id="${user.id}" data-username="${user.username}" style="width: auto;"><i class='bx bx-trash'></i> 删除</button>`}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // 2. 渲染移动端卡片列表
    this.mobileGrid.innerHTML = users.map(user => {
      const roleText = user.role === 'admin' ? '管理员' : '球员';
      const dateStr = this.formatDateTime(user.created_at);
      const isSelf = user.username === currentUsername;

      return `
        <div class="user-mobile-card">
          <div class="user-mobile-header">
            <span class="user-mobile-name">${user.username} ${isSelf ? '<span style="color: var(--primary-color); font-size: 0.75rem;">(我)</span>' : ''}</span>
            <span class="role-badge ${user.role}">${roleText}</span>
          </div>
          <div class="user-mobile-row">
            <span>昵称:</span>
            <span>${user.nickname}</span>
          </div>
          <div class="user-mobile-row">
            <span>创建时间:</span>
            <span>${dateStr}</span>
          </div>
          <div class="user-mobile-actions">
            <button class="secondary-btn edit-nickname-btn" data-id="${user.id}" data-username="${user.username}" data-nickname="${user.nickname}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;"><i class='bx bx-edit-alt'></i> 改昵称</button>
            <button class="secondary-btn edit-pw-btn" data-id="${user.id}" data-username="${user.username}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;"><i class='bx bx-key'></i> 改密</button>
            ${isSelf ? '' : `<button class="danger-btn delete-user-btn" data-id="${user.id}" data-username="${user.username}" style="width: auto; padding: 0.3rem 0.6rem; font-size: 0.75rem;"><i class='bx bx-trash'></i> 删除</button>`}
          </div>
        </div>
      `;
    }).join('');
  }

  formatDateTime(utcStr) {
    if (!utcStr) return '-';
    let parsedStr = utcStr;
    // 如果 SQLite 的时间字符串没有包含 T 且没有以 Z 结尾，说明需要加上 Z 作为 UTC 时间戳，以便浏览器转换为正确的本地时区
    if (!parsedStr.includes('T') && !parsedStr.includes('Z')) {
      parsedStr = parsedStr.replace(' ', 'T') + 'Z';
    }
    const d = new Date(parsedStr);
    return isNaN(d.getTime()) ? utcStr : d.toLocaleString();
  }
}
