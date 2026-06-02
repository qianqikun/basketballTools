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

// 内存缓存机制
let cachedStore = null; // 缓存热数据对象 (teams, tournaments, pastTournaments: [])
let cachedPast = null;  // 缓存冷数据数组 (pastTournaments 历史归档列表)

// 初始化数据库表和自动数据迁移
const initPromise = new Promise((resolve) => {
  db.serialize(() => {
    // 1. 创建核心热数据表
    db.run(`
      CREATE TABLE IF NOT EXISTS app_data (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json_data TEXT NOT NULL
      )
    `);

    const initialData = JSON.stringify({ teams: [], tournaments: [], pastTournaments: [] });
    db.run(`
      INSERT OR IGNORE INTO app_data (id, json_data) VALUES (1, ?)
    `, [initialData]);

    // 2. 创建冷数据表 (独立存储历史归档赛程)
    db.run(`
      CREATE TABLE IF NOT EXISTS past_tournaments (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json_data TEXT NOT NULL
      )
    `);

    db.run(`
      INSERT OR IGNORE INTO past_tournaments (id, json_data) VALUES (1, '[]')
    `);

    // 3. 创建用户表
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

    // 4. 平滑自动迁移逻辑
    db.get(`SELECT json_data FROM app_data WHERE id = 1`, (err, row) => {
      if (err) {
        console.error('📦 [DB Migration] 读取主数据失败:', err);
        return resolve();
      }
      if (row) {
        try {
          const oldData = JSON.parse(row.json_data);
          // 如果旧数据中含有 pastTournaments，说明需要进行冷热数据分离迁移
          if (oldData.pastTournaments && oldData.pastTournaments.length > 0) {
            console.log(`📦 [DB Migration] 检测到旧数据中包含 ${oldData.pastTournaments.length} 个历史归档赛程，开始平滑迁移...`);
            
            db.serialize(() => {
              // 1. 将历史数据写入专门的历史表
              db.run(
                `UPDATE past_tournaments SET json_data = ? WHERE id = 1`,
                [JSON.stringify(oldData.pastTournaments)],
                (err1) => {
                  if (err1) {
                    console.error('📦 [DB Migration] 历史数据迁移写入新表失败:', err1);
                    return resolve();
                  }

                  // 2. 清理主数据库，清空 pastTournaments
                  const migratedStore = {
                    teams: oldData.teams || [],
                    tournaments: oldData.tournaments || [],
                    pastTournaments: [] // 主库保持置空状态
                  };

                  db.run(
                    `UPDATE app_data SET json_data = ? WHERE id = 1`,
                    [JSON.stringify(migratedStore)],
                    (err2) => {
                      if (err2) {
                        console.error('📦 [DB Migration] 清理主数据表历史字段失败:', err2);
                      } else {
                        console.log('📦 [DB Migration] 冷热数据平滑分离迁移成功！已完成老历史数据转移。');
                        cachedStore = migratedStore;
                        cachedPast = oldData.pastTournaments;
                      }
                      resolve();
                    }
                  );
                }
              );
            });
          } else {
            // 无需迁移
            resolve();
          }
        } catch (e) {
          console.error('📦 [DB Migration] 数据解析迁移出错:', e);
          resolve();
        }
      } else {
        resolve();
      }
    });
  });
});

// 获取历史归档赛程
const getPastTournaments = async () => {
  await initPromise;
  
  if (cachedPast) {
    return JSON.parse(JSON.stringify(cachedPast));
  }

  return new Promise((resolve, reject) => {
    db.get(`SELECT json_data FROM past_tournaments WHERE id = 1`, (err, row) => {
      if (err) return reject(err);
      if (row) {
        try {
          cachedPast = JSON.parse(row.json_data);
          resolve(JSON.parse(row.json_data));
        } catch (e) {
          resolve([]);
        }
      } else {
        resolve([]);
      }
    });
  });
};

// 获取数据 (参数 includePast 决定是否合并历史归档赛程)
const getData = async (includePast = false) => {
  await initPromise;

  let hotData;
  if (cachedStore) {
    hotData = JSON.parse(JSON.stringify(cachedStore));
  } else {
    hotData = await new Promise((resolve, reject) => {
      db.get(`SELECT json_data FROM app_data WHERE id = 1`, (err, row) => {
        if (err) return reject(err);
        if (row) {
          try {
            cachedStore = JSON.parse(row.json_data);
            resolve(JSON.parse(row.json_data));
          } catch (e) {
            resolve({ teams: [], tournaments: [], pastTournaments: [] });
          }
        } else {
          resolve({ teams: [], tournaments: [], pastTournaments: [] });
        }
      });
    });
  }

  // 保持向前兼容，自动迁移单赛程结构
  let needSave = false;
  if (!hotData.tournaments) {
    hotData.tournaments = [];
    needSave = true;
  }
  if (hotData.hasOwnProperty('tournament') && hotData.tournament && typeof hotData.tournament === 'object') {
    const legacyT = { ...hotData.tournament };
    if (!legacyT.id) legacyT.id = 'tour_legacy';
    if (!legacyT.name) legacyT.name = '正式杯赛';
    if (legacyT.currentMatches) {
      legacyT.currentMatches = legacyT.currentMatches.map(m => ({
        ...m,
        tournamentId: legacyT.id,
        tournamentName: legacyT.name
      }));
    }
    if (!hotData.tournaments.some(t => t.id === legacyT.id)) {
      hotData.tournaments.push(legacyT);
    }
    hotData.tournament = null;
    needSave = true;
  }

  if (needSave) {
    console.log('🔄 [DB Migration] 检测到旧赛程格式，自动迁移为多赛程格式并在后端存盘...');
    await saveDataInternal(hotData);
  }

  // 合并冷数据（如果有需要的话）
  if (includePast) {
    hotData.pastTournaments = await getPastTournaments();
  } else {
    hotData.pastTournaments = [];
  }

  return hotData;
};

// 保存热数据的辅助方法
const saveDataInternal = async (hotData) => {
  const jsonStr = JSON.stringify(hotData);
  cachedStore = JSON.parse(jsonStr); // 同步更新缓存
  
  return new Promise((resolve, reject) => {
    db.run(`UPDATE app_data SET json_data = ? WHERE id = 1`, [jsonStr], function(err) {
      if (err) return reject(err);
      resolve();
    });
  });
};

// 保存数据入口
const saveData = async (dataObj) => {
  await initPromise;

  // 如果明确传入了 pastTournaments，说明可能发起了赛程归档或清理历史归档
  if (dataObj.pastTournaments && Array.isArray(dataObj.pastTournaments)) {
    const newPastStr = JSON.stringify(dataObj.pastTournaments);
    const oldPastStr = cachedPast ? JSON.stringify(cachedPast) : '[]';

    // 仅在有实质变化时写入，减少不必要的冷数据磁盘写 IO
    if (newPastStr !== oldPastStr) {
      console.log(`💾 [DB] 历史归档赛程发生变动，写入 past_tournaments 表...`);
      cachedPast = JSON.parse(newPastStr);
      await new Promise((resolve, reject) => {
        db.run(`UPDATE past_tournaments SET json_data = ? WHERE id = 1`, [newPastStr], function(err) {
          if (err) return reject(err);
          resolve();
        });
      });
    }
  }

  // 剥离出主表的“热数据”，主表始终不存完整的 pastTournaments，只存放空数组，保持轻量
  const hotData = {
    teams: dataObj.teams || [],
    tournaments: dataObj.tournaments || [],
    pastTournaments: [] // 主热数据表始终置空
  };

  await saveDataInternal(hotData);
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
      // 将 SQLite 默认不含时区后缀的 UTC 时间字符串转为标准 UTC ISO 时间戳格式 (添加 T 和 Z 后缀)
      const processedRows = rows.map(row => {
        if (row.created_at && !row.created_at.includes('T') && !row.created_at.includes('Z')) {
          row.created_at = row.created_at.replace(' ', 'T') + 'Z';
        }
        return row;
      });
      resolve(processedRows);
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
  getPastTournaments,
  hashPassword,
  createUser,
  getUserByUsername,
  getAllUsers,
  updateUserPassword,
  updateUserNickname,
  deleteUser
};

