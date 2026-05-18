# 🏀 篮球比赛管理工具 (Basketball Tournament & Scoreboard Manager)

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/node.js-v18.x-green.svg?style=flat&logo=node.js)](https://nodejs.org/)
[![SQLite3](https://img.shields.io/badge/sqlite3-v3.x-blue.svg?style=flat&logo=sqlite)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/license-ISC-orange.svg?style=flat)](./LICENSE)

这是一款专为民间业余篮球赛、社区联赛、单位友谊赛量身定制的**轻量级、云原生、移动端极佳适配**的篮球比赛与赛程对阵管理工具。

项目采用现代暗黑极客运动风（Cyberpunk Grid & Neon Palette），集成了**自动抽签对阵、主客队双分栏记分大屏、多标签页/多端互斥锁定机制、高频赛况毫秒级恢复、以及一键 Docker 部署**等硬核功能。

---

## 🌟 核心特性 (Key Features)

### 1. 📂 参赛球队管理与一键淘汰制抽签
* 支持便捷的球队报名录入与实时花名册。
* 自动根据报名球队数量生成**单败淘汰制（Single Elimination）对阵图谱**。
* **智能轮空（BYE）机制**：当球队数量为奇数或非 2 的整数次幂时，自动计算并分配轮空，获胜者一键晋级至下一轮，无需人工排班。

### 2. ⏱️ 掌上专业记分大屏 (Ergonomic Scoreboard)
* **主客队双分栏布局**：专为移动端（手机/iPad）单手握持设计。左手大拇指掌控主队，右手大拇指掌控客队，绝对对称，盲操极佳。
* **极速控时**：置顶的时钟面板集成“开始/暂停”与一键重置，时限（24s/14s）指尖触控，计分按键（+1, +2, +3, -1）以 2x2 矩阵无缝平铺，告别滚动，单屏全掌控。
* **技术统计**：自带节数（Period）、全队犯规数（Fouls）和暂停数（Timeouts）的增减计数器。

### 3. 🔒 独创的多设备/多标签页互斥锁 (Device Takeover Lock)
* **拒绝冲突**：通过给每个记分端分配唯一的 `clientId`，结合 SQLite 底层锁定判定，防止两位裁判同时进入同一场比赛记分造成数据覆盖。
* **智能强行接管**：若前一台设备因断电、死机异常离线，新设备接入时会触发警示弹窗，允许进行**“强制解锁并接管”**，确保比赛流畅进行。
* **调试友好**：底层将 `localStorage` 重构为隔离的 `sessionStorage`，允许在同一台电脑的多开标签页中，完美模拟不同设备的锁冲突与交互。

### 4. ⚡ 毫秒级赛况防刷新丢失 (State Auto-Restore)
* 在时钟走秒、加减比分、犯规和暂停等任何高频动作发生时，系统会以**毫秒级延迟**在本地同步当前赛况快照。
* 即使在激烈的比赛中误触浏览器刷新、切换页面或断网，重新载入时会自动检测并进入**“恢复接管模式”**，完美复原最后一秒的倒计时和比分。

### 5. 🏆 精致的赛程历史档案 (Historical Archives)
* **LIVE 动态呼吸灯**：历史列表中进行中的比赛卡片会自动挂载温暖的橙色虚线边框，并伴有呼吸频率的闪烁 `LIVE` 徽章。
* **智能冠军加冕**：赛程完结归档后，系统根据最终晋级链路，自动生成带有**金黄色奖杯绿色缎带勋章（🏆 冠军：某某队）**的黑胶磨砂质感归档大卡片；对提前中止的赛程也会亮起红色风险警示。

---

## 🎨 视觉美学 (Aesthetics)

* **UI 风格**：深色低反光暗黑背景（#0f172a），辅以篮球活力橙（#f97316）和科技荧光绿（#22c55e）。
* **流畅动效**：
  * 移动端汉堡菜单采用平滑的 `slideDown` 渐显下落动效，轻触任一导航项自动收折。
  * 往届归档记录卡片自带悬浮微位移（`translateY(-2px)`）和高级发光弥散阴影。
  * 已打完的历史轮次在抽签界面以只读形式进行 `opacity: 0.75` 的精致半透明淡化铺垫。

---

## 🛠️ 技术栈 (Tech Stack)

* **前端**：HTML5 语义化结构、CSS3 变量 + 弹性网格响应式、ES6 原生模块化（Modular JS）、Boxicons 矢量图标库。
* **后端**：Node.js + Express (高并发路由响应)。
* **数据库**：SQLite3 (本地嵌入式零配置轻量级数据库)。
* **容器化**：Docker / Docker Compose (支持 ARM64/AMD64 双架构交叉编译)。

---

## 🚀 部署指南 (Deployment Guide)

无论是在您本地的 Mac 开发环境，还是在远程云服务器上，我们均提供了极致简便的部署方式。

### 方式一：本地极速运行 (Local Dev)
1. 确保安装了 [Node.js (v18+)](https://nodejs.org/)。
2. 在项目根目录下执行：
   ```bash
   # 安装运行期依赖
   npm install
   
   # 启动后端与前端托管服务
   npm run start
   ```
3. 浏览器访问：`http://localhost:3000`。

---

### 方式二：Docker 本地一键部署 (Docker Compose)
为了完全隔离系统依赖并保证数据持久化，我们提供了一个**智能部署脚本**。
1. 在项目根目录下，直接运行：
   ```bash
   ./deploy.sh
   ```
2. **部署脚本会自动完成：**
   * 检测并清理可能残留的冲突端口容器。
   * 自动构建高兼容性的 Docker 镜像并以后台（`-d`）模式启动。
   * **自动获取您电脑的局域网 IP 地址**，并在控制台中贴心输出：
     * `🏠 本地浏览器访问地址: http://localhost:3000`
     * `📱 手机/局域网真机测试地址: http://<您的局域网IP>:3000` (方便您直接用手机浏览器接入，测试单屏掌控布局！)

---

### 方式三：企业级 Docker Hub 云端部署 (CI/CD / Remote Cloud)
如果您需要将项目部署在远程服务器（如阿里云、腾讯云、AWS）上，且**不想在服务器上拉取源码和重新编译**：

#### Step 1: 在您本地 Mac 编译并推送至 Docker Hub
我们为您设计了 **多架构（linux/amd64 和 linux/arm64）多平台交叉编译** 脚本，即使在 Mac M 芯片上也能构建出适合 x86 云服务器的原生二进制镜像。
1. 本地运行推送脚本：
   ```bash
   ./push-image.sh
   ```
2. 输入您的 **Docker Hub 用户名**。
3. 脚本会自动完成多架构打包、日期版本标记并推送到 Docker Hub 仓库。
4. 同时，它会在本地自动为您输出一份定制化的 **`docker-compose.prod.yml`** 生产部署模板。

#### Step 2: 在您的云服务器上一键拉起
1. 将刚才生成的 `docker-compose.prod.yml` 文件单独复制或上传到云服务器的任意空目录中。
2. 在该目录下直接运行：
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
3. 服务器将自动从 Docker Hub 拉取最适合它硬件架构的原生镜像并运行。
4. **💾 数据持久化保证**：数据会自动保存在云服务器当前目录的 `data/` 文件夹中。未来哪怕您更新、销毁容器，只要此目录存在，**历史赛果和记录永远安全，永不丢失**！

---

## 📂 项目结构说明 (Directory Structure)

```text
basketballTools/
├── css/
│   └── style.css            # 核心样式系统（含手机端并排记分、折叠导航菜单）
├── js/
│   ├── app.js               # 路由调度与全局生命周期控制器（包含设备ID管理与视图切换）
│   └── modules/
│       ├── draw.js          # 球队管理与淘汰赛对阵抽签视图（包含设备锁定与接管弹框）
│       ├── history.js       # 赛程历史与往届归档记录卡片渲染器
│       └── match.js         # 实时记分板控制器（倒计时高频毫秒缓存、事件总线绑定）
├── server/
│   ├── db.js                # SQLite 数据库底层逻辑（支持 DATA_DIR 路径自愈与建表）
│   └── index.js             # Express 核心 API 与静态页面托管服务
├── Dockerfile               # 跨平台 Node-SQLite 构建配置
├── docker-compose.yml       # 本地开发/运行容器编排配置
├── deploy.sh                # 局域网自适应一键构建脚本（已加执行权限）
├── push-image.sh            # 跨架构多平台 Docker Hub 构建推送脚本（已加执行权限）
├── .dockerignore            # Docker 编译时无用文件过滤器
├── .gitignore               # Git 提交内容过滤清单
└── README.md                # 本帮助说明文档
```

---

## 📄 开源许可证

本项目基于 [ISC License](./LICENSE) 协议开源，欢迎各位篮球爱好者、野生开发者进行二次创作、优化及打磨！
🎉 祝您的篮球赛事圆满成功，哨响球进，Antigravity 伴您每一次绝杀时刻！
