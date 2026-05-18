const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

// 配置中间件
app.use(cors()); // 允许跨域
app.use(express.json({ limit: '50mb' })); // 允许较大的 JSON 载荷（虽然我们的数据不大）

// 静态文件托管：把现有的前端页面通过后端提供服务
// 注意：我们的前端代码就在项目根目录下
app.use(express.static(path.join(__dirname, '../')));

// API 路由
// 获取最新数据
app.get('/api/store', async (req, res) => {
  try {
    const data = await db.getData();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Failed to get data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 保存数据
app.post('/api/store', async (req, res) => {
  try {
    const dataObj = req.body;
    await db.saveData(dataObj);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to save data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 篮球比赛工具后端服务已启动!`);
  console.log(`👉 浏览器访问: http://localhost:${PORT}`);
  console.log(`=================================`);
});
