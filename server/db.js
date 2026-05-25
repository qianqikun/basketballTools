const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 密码哈希辅助函数
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

// 数据库文件路径支持环境变量配置，更友好地支持 Docker 卷挂载持久化
const dbDir = process.env.DATA_DIR || path.resolve(__dirname, '../');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'data.sqlite');
const db = new sqlite3.Database(dbPath);

// 初始化表
db.serialize(() => {
  // 我们只用一张表，存一条记录，包含所有的前端 JSON 数据
  db.run(`
    CREATE TABLE IF NOT EXISTS app_data (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json_data TEXT NOT NULL
    )
  `);

  // 插入一条初始数据（如果还不存在的话）
  const initialData = JSON.stringify({ teams: [], tournament: null, pastTournaments: [] });
  db.run(`
    INSERT OR IGNORE INTO app_data (id, json_data) VALUES (1, ?)
  `, [initialData]);

  // 创建用户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      nickname TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, () => {
    // 初始化默认管理员账号
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = hashPassword(adminPass);

    db.get(`SELECT id FROM users WHERE username = ?`, [adminUser], (err, row) => {
      if (err) {
        console.error('查询管理员账户失败:', err);
        return;
      }
      if (row) {
        // 管理员已存在，强制更新密码哈希，以便通过 Docker 环境变量覆盖密码
        db.run(`
          UPDATE users SET password_hash = ?, role = 'admin', nickname = '管理员' WHERE id = ?
        `, [hash, row.id], (err2) => {
          if (err2) console.error('更新管理员账户失败:', err2);
          else console.log(`🔒 默认管理员账户 [${adminUser}] 已通过环境变量更新`);
        });
      } else {
        // 管理员不存在，执行插入
        db.run(`
          INSERT INTO users (username, nickname, password_hash, role) VALUES (?, '管理员', ?, 'admin')
        `, [adminUser, hash], (err2) => {
          if (err2) console.error('创建管理员账户失败:', err2);
          else console.log(`🔒 默认管理员账户 [${adminUser}] 已初始化成功`);
        });
      }
    });
  });
});

// 获取数据
const getData = () => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT json_data FROM app_data WHERE id = 1`, (err, row) => {
      if (err) return reject(err);
      if (row) {
        try {
          resolve(JSON.parse(row.json_data));
        } catch(e) {
          resolve({ teams: [], tournament: null, pastTournaments: [] });
        }
      } else {
        resolve({ teams: [], tournament: null, pastTournaments: [] });
      }
    });
  });
};

// 保存数据
const saveData = (dataObj) => {
  return new Promise((resolve, reject) => {
    const jsonStr = JSON.stringify(dataObj);
    db.run(`UPDATE app_data SET json_data = ? WHERE id = 1`, [jsonStr], function(err) {
      if (err) return reject(err);
      resolve();
    });
  });
};

// 新增用户操作数据库接口
const createUser = (username, nickname, passwordHash, role = 'player') => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (username, nickname, password_hash, role) VALUES (?, ?, ?, ?)`,
      [username, nickname, passwordHash, role],
      function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, username, nickname, role });
      }
    );
  });
};

const getUserByUsername = (username) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

const getAllUsers = () => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT id, username, nickname, role, created_at FROM users ORDER BY id DESC`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

const updateUserPassword = (userId, newPasswordHash) => {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [newPasswordHash, userId], function(err) {
      if (err) return reject(err);
      resolve(this.changes > 0);
    });
  });
};

const updateUserNickname = (userId, newNickname) => {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE users SET nickname = ? WHERE id = ?`, [newNickname, userId], function(err) {
      if (err) return reject(err);
      resolve(this.changes > 0);
    });
  });
};

const deleteUser = (userId) => {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM users WHERE id = ?`, [userId], function(err) {
      if (err) return reject(err);
      resolve(this.changes > 0);
    });
  });
};

module.exports = {
  getData,
  saveData,
  hashPassword,
  createUser,
  getUserByUsername,
  getAllUsers,
  updateUserPassword,
  updateUserNickname,
  deleteUser
};

