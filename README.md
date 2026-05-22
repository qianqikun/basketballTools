# 🏀 篮球比赛管理工具 (Basketball Tournament & Scoreboard Manager)

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/node.js-v18.x-green.svg?style=flat&logo=node.js)](https://nodejs.org/)
[![SQLite3](https://img.shields.io/badge/sqlite3-v3.x-blue.svg?style=flat&logo=sqlite)](https://www.sqlite.org/)
[![WebSocket](https://img.shields.io/badge/websocket-ws-lightgrey.svg?style=flat&logo=socket.io)](https://github.com/websockets/ws)
[![Edge TTS](https://img.shields.io/badge/TTS-msedge--tts-orange.svg?style=flat)](https://github.com/Cacpro/msedge-tts)
[![License](https://img.shields.io/badge/license-ISC-red.svg?style=flat)](./LICENSE)

这是一款专为民间业余篮球赛、社区联赛、单位友谊赛量身定制的**轻量级、云原生、多端自适应同步**的篮球比赛与赛程对战管理系统。

项目采用现代暗黑极客运动风（Cyberpunk Grid & Neon Palette），在原有“智能排兵布阵”和“专业裁判记分”的基础上，全新重构升级为支持**多场比赛并行实时观战、WebRTC 直播流嵌入、全屏彩虹弹幕互动、以及 AI 级千人千声语音自动播报解说**的现场级赛事管理平台。

---

## 🌟 核心特性 (Key Features)

### 1. 📂 参赛球队管理与一键淘汰制抽签
* 支持便捷的球队报名录入、实时报名列表与队员花名册管理。
* 自动根据报名球队数量生成标准的**单败淘汰制（Single Elimination）对阵图谱**。
* **智能轮空（BYE）机制**：当球队数量为奇数或非 2 的整数次幂时，自动计算并分配轮空，获胜者一键晋级至下一轮，无需人工排班。

### 2. ⏱️ 掌上专业记分大屏 (Ergonomic Scoreboard)
* **主客队双分栏布局**：专为移动端（手机/iPad）单手握持设计。左手大拇指掌控主队，右手大拇指掌控客队，绝对对称，盲操极佳。
* **极速控时**：置顶的时钟面板集成“开始/暂停”与一键重置，时限（24s/14s）指尖触控，计分按键（+1, +2, +3, -1）以 2x2 矩阵无缝平铺，告别滚动，单屏全掌控。
* **手势防误触屏蔽**：全面禁用了移动端浏览器的双击缩放（double-tap zoom）和双指拉伸缩放行为，防止裁判频繁快速点击加分时导致页面发生意外放大、卡顿或错位。

### 3. 🔒 多设备/多标签页互斥锁 (Device Takeover Lock)
* **拒绝冲突**：通过给每个记分端分配唯一的 `clientId`，结合 SQLite 底层锁定判定，防止两位裁判同时进入同一场比赛记分造成数据覆盖。
* **智能强行接管**：若前一台设备因断电、死机异常离线，新设备接入时会触发警示弹窗，允许进行**“强制解锁并接管”**，确保比赛流畅进行。
* **调试友好**：底层将 `localStorage` 重构为隔离的 `sessionStorage`，允许在同一台电脑的多开标签页中，完美模拟不同设备的锁冲突与交互。

### 4. 📺 实时多端同步观赛大屏与 WebRTC 直播 (Live Streaming Panel)
* **多场比赛并行观战**：支持多个场地、多场比赛同时开赛，观众大屏可以通过 WebSocket 毫秒级同步各场地记分员的分数变化和剩余时间，实现“多赛道”同步看球。
* **WebRTC 直播流嵌入**：观赛大屏整合了超低延迟的 WebRTC 视频直播推流与拉流渲染，配合视频框的挤压/展开布局，让实时比分与现场赛况融为一体。
* **非安全上下文自适应**：在局域网内测（非 HTTPS 上下文）时，完美兼容一键复制推流地址功能，极大简化了裁判和摄像机推流测试工作。

### 5. 💬 炫彩弹幕互动与服务端历史记录 (Colorful Danmaku)
* **个性弹幕发送**：观众在大屏右侧或全屏状态下，可自定义昵称，并选择白色、红色、黄色、绿色、蓝色等五种彩色弹幕。
* **快捷胶囊推荐词**：底部控制栏提供 `🔥 666`、`👍 好球！`、`🏀 漂亮！`、`🛡️ 防守！`、`⚡ 绝杀！` 推荐词，轻点一键快捷上屏。
* **服务端数据持久化**：WebSocket 接收到弹幕后，会持久化同步到当前比赛的弹幕历史列表中（限制最多 200 条防内存溢出）。提供可折叠的“历史弹幕面板”，观众能随时回顾精彩互动。

### 6. 🎙️ AI 语音自动播报与个性化音色队列 (AI Voice Commentator)
* **微软 Edge TTS 驱动**：服务端集成高质量微软文本转语音合成接口。观众发送弹幕时，现场音箱可自动合成并播报该条弹幕，瞬间拉满球馆氛围。
* **千人千声个性音色**：观众在发送弹幕时可自主选择播报音色，目前提供：
  * `🏀 云健`（专业男解说）
  * `💬 云希`（活泼男）
  * `🎙️ 云阳`（稳重男主持）
  * `👩 晓晓`（活泼女）
  * `⚡ 晓北`（辽宁方言女）
  * `🛡️ 晓妮`（陕西方言女）
* **语音播放防重叠队列**：内置基于 Promise 的**语音播放防重叠队列**。多条弹幕几乎同时到达时，会自动进入播放队列，按顺序平滑播报，绝对不出现多声轨同时合成导致的刺耳叠音。
* **一键静音控制**：控制台提供一键开启/关闭弹幕语音按钮，能瞬间静音或开启播报。

---

## 🎨 视觉美学 (Aesthetics)

* **UI 风格**：深色低反光暗黑背景（#0f172a），辅以篮球活力橙（#f97316）和科技荧光绿（#22c55e）。
* **毛玻璃控制栏**：全屏状态下的弹幕控制与发送栏使用精美的 `backdrop-filter: blur(16px)` 毛玻璃质感，底部浮动交互，并在闲置 3 秒后自动优雅淡出，将屏幕完全留给比赛和弹幕。
* **顺滑动效**：
  * 弹幕文本使用 CSS3 `@keyframes` 实现细腻的左移飞入动画，文字边缘带有文字阴影以防被复杂视频背景吞噬。
  * 下拉菜单、颜色选择气泡、切换按钮配有微弱位移和弹性缩放动效（`transform: scale(1.1)`）。
  * 移动端汉堡菜单采用平滑的 `slideDown` 渐显下落动效，轻触任一导航项自动收折。

---

## 🛠️ 技术栈 (Tech Stack)

* **前端**：HTML5 语义化结构、CSS3 变量 + Flex/Grid 弹性响应式布局、ES6 原生模块化（Modular JS）、Boxicons 矢量图标库、Web Speech API。
* **后端**：Node.js + Express (高并发 API 托管)、ws (WebSocket 双向极速数据传输)、msedge-tts (微软高质量语音流合成)。
* **数据库**：SQLite3 (本地嵌入式零配置轻量级数据库)。
* **容器化**：Docker / Docker Compose (支持 ARM64/AMD64 双架构交叉编译)。

---

## 🚀 部署指南 (Deployment Guide)

无论是在您本地的 Mac 开发环境，还是在远程云服务器上，我们均提供了极致简便的部署方式。

### 方式一：本地极速运行 (Local Dev)
1. 确保安装了 [Node.js (v18+)](https://nodejs.org/)。
2. 在项目根目录下执行：
   ```bash
   # 安装运行期与服务端 TTS 依赖
   npm install
   
   # 启动后端与前端托管服务
   npm run start
   ```
3. 浏览器访问：`http://localhost:3000`。

---

### 方式二：Docker & Docker Compose 一键部署 (推荐)
通过 Docker Compose 部署，可以完全隔离系统依赖并保证数据持久化。

1. **一键启动所有服务**：在项目根目录下，直接运行以下命令：
   ```bash
   docker-compose up -d --build
   ```
   *这会自动构建镜像，并在后台启动容器。*

2. **验证与访问**：
   * 在电脑浏览器访问: `http://localhost:3000`
   * 若要在手机端或大屏上进行局域网测试访问，请使用: `http://<您电脑的局域网IP>:3000`
   
3. **数据持久化保证**：
   项目会自动在同级目录下挂载 `./data` 文件夹。您的所有配置、参赛队伍名单、赛程历史、每一场比赛的比分数据都会实时保存在 `data.sqlite` 中。未来哪怕您更新镜像或重启容器，数据都**安全且永不丢失**！

*(注：如果您使用的是 Mac/Linux，我们还提供了一个自动识别局域网 IP 的小助手 `./deploy.sh`，可直接执行 `sh deploy.sh` 一键启动。)*

---

### 方式三：企业级 Docker Hub 云端部署 (CI/CD / Remote Cloud)
如果您需要将项目部署在远程服务器（如阿里云、腾讯云、AWS）上，且**不想在服务器上拉取源码和重新编译**：

#### Step 1: 在您本地 Mac 编译并推送至 Docker Hub
我们为您设计了 **多架构（linux/amd64 和 linux/arm64）多平台交叉编译** 脚本，即使在 Mac M 芯片上也能构建出适合 x86 云服务器的原生二进制镜像。
1. 本地运行推送脚本：
   ```bash
   chmod +x push-image.sh
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
│   └── style.css            # 核心样式系统（含手机端并排记分、全屏毛玻璃控制栏、弹幕飞行动画）
├── js/
│   ├── app.js               # 路由调度与全局生命周期控制器（包含设备ID管理与视图切换）
│   └── modules/
│       ├── registration.js  # [NEW] 参赛球队报名录入与实时花名册视图
│       ├── draw.js          # 淘汰赛抽签与对阵图谱渲染（支持轮空晋级与设备锁提示）
│       ├── history.js       # 赛程历史与已完结历史记录大卡片归档
│       ├── match.js         # 实时记分板控制器（倒计时高频毫秒缓存、加减分事件总线绑定）
│       └── live.js          # [NEW] 实时观赛大屏与全屏弹幕互动模块 (含 WebRTC 推拉流、AI 播报防重叠队列)
├── server/
│   ├── db.js                # SQLite 数据库底层逻辑（支持 DATA_DIR 路径自愈与建表）
│   └── index.js             # Express 核心 API、WebSocket 广播服务器及 Edge TTS 语音流合成服务
├── Dockerfile               # 跨平台 Node-SQLite 构建配置
├── docker-compose.yml       # 本地开发/运行容器编排配置
├── deploy.sh                # 局域网自适应一键构建脚本
├── push-image.sh            # 跨架构多平台 Docker Hub 构建推送脚本
├── .dockerignore            # Docker 编译时无用文件过滤器
├── .gitignore               # Git 提交内容过滤清单
└── README.md                # 本帮助说明文档
```

---

## 📄 开源许可证

本项目基于 [ISC License](./LICENSE) 协议开源，欢迎各位篮球爱好者、野生开发者进行二次创作、优化及打磨！
🎉 祝您的篮球赛事圆满成功，哨响球进，Antigravity 伴您每一次绝杀时刻！
