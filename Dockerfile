# 使用官方 Node.js 18 基础镜像 (使用已验证的稳定国内加速代理，绕过 auth.docker.io DNS 污染)
FROM docker.1ms.run/library/node:18-slim

# 安装 SQLite3 构建所需的底层依赖工具（作为编译回退保障，同时清理缓存）
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 设置容器内工作目录
WORKDIR /app

# 复制依赖描述文件
COPY package*.json ./

# 安装依赖（--only=production 剔除开发依赖，保持轻量）
RUN npm ci --only=production

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
CMD ["npm", "start"]
