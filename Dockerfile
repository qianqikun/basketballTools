FROM hub.rat.dev/library/node:20-slim    

# 安装 SQLite3 构建所需的底层依赖工具（作为编译回退保障，同时清理缓存）
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 设置容器内工作目录
WORKDIR /app

# 只复制 package.json，完全排除 package-lock.json。
# 💡 核心避坑指南：因为 package-lock.json 内含有瓜子内网私有源域名 (npm.guazi-corp.com)，
# 容器内无法解析下载该内网域名下的 tgz 包，导致 npm ci 强行拉取时失败或拉下来全是“空壳文件夹”。
# 通过不复制 lockfile，并使用淘宝公网源安装，可以彻底规避此问题！
COPY package.json ./

# 安装依赖（配置国内极速镜像源，强制从公网全新下载）
# 安装依赖（--only=production 剔除开发依赖，保持轻量）
# 💡 核心避坑指南：sqlite3 预编译二进制可能要求 GLIBC 2.38，而 node:20-slim (Debian Bookworm) 只提供 GLIBC 2.36，
# 因此必须在安装后通过 --build-from-source 强行从源码重新编译 sqlite3，使其 100% 兼容容器内的 GLIBC 版本！
RUN npm config set registry https://registry.npmmirror.com && \
    npm install --production --no-audit --no-fund && \
    npm rebuild sqlite3 --build-from-source --no-audit --no-fund

# 复制项目其他所有源码
COPY . .

# 创建并准备持久化数据文件夹
RUN mkdir -p /app/data

# 暴露前端/后端共用的 3000 端口
EXPOSE 3000

# 默认设置数据存放位置，配合 docker-compose 卷挂载实现完美持久化
ENV DATA_DIR=/app/data
ENV PORT=3000
ENV NODE_ENV=production

# 启动服务器
# 💡 生产环境最佳实践：直接使用 node 启动，让其作为 PID 1 进程，以便能瞬间响应并处理系统的优雅停机信号（如 SIGTERM）
CMD ["node", "server/index.js"]
