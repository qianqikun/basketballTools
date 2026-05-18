const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

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

module.exports = {
  getData,
  saveData
};
