# ==========================================
# 阶段1：构建前端 React 打包产物 (frontend-builder)
# ==========================================
FROM node:20-slim AS frontend-builder
WORKDIR /build
COPY frontend/package.json ./
RUN npm config set registry https://registry.npmmirror.com && \
    npm install
COPY frontend/ ./
RUN npm run build

# ==========================================
# 阶段2：构建 Node 后端生产运行环境
# ==========================================
FROM node:20-slim    

# 安装 SQLite3 构建所需的底层依赖工具（作为编译回退保障，同时清理缓存）
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 设置容器内工作目录
WORKDIR /app

# 只复制 package.json，完全排除 package-lock.json
COPY package.json ./

# 安装依赖并从源码重新编译 sqlite3
RUN npm config set registry https://registry.npmmirror.com && \
    npm install --production --no-audit --no-fund && \
    npm rebuild sqlite3 --build-from-source --no-audit --no-fund

# 复制后端源码
COPY server/ ./server/

# 从阶段1 (frontend-builder) 拷贝前端编译好的静态 dist 目录
COPY --from=frontend-builder /build/dist ./frontend/dist

# 创建数据持久化文件夹
RUN mkdir -p /app/data

# 暴露端口并配置环境变量
EXPOSE 3000
ENV DATA_DIR=/app/data
ENV PORT=3000
ENV NODE_ENV=production

# 启动服务器
CMD ["node", "server/index.js"]
