#!/bin/bash

# ==========================================================================
# 🏀 篮球比赛管理工具 Docker Hub 构建与推送脚本 (push-image.sh)
# ==========================================================================

# 终端彩色配置
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}====================================================${NC}"
echo -e "  🚀 ${YELLOW}Docker Hub 镜像多架构构建与发布工具${NC}"
echo -e "${CYAN}====================================================${NC}"

# 输入 Docker Hub 用户名
read -p "✍️ 请输入您的 Docker Hub 用户名 (Username): " DOCKER_USER

if [ -z "$DOCKER_USER" ]; then
  echo -e "❌ ${RED}错误: 用户名不能为空！${NC}"
  exit 1
fi

IMAGE_NAME="basketball-tools"
TAG="latest"

echo -e "\n📦 即将构建并推送镜像: ${CYAN}${DOCKER_USER}/${IMAGE_NAME}:${TAG}${NC}"

# 1. 检查 Docker 运行状态
if ! docker info &>/dev/null; then
  echo -e "❌ ${RED}错误: Docker 未启动，请先运行 Docker Desktop！${NC}"
  exit 1
fi

# 2. 引导 Docker 登录
echo -e "\n${YELLOW}🔑 检查 Docker Hub 登录状态...${NC}"
echo "提示：如果已登录会自动跳过，未登录请输入 Docker Hub 密码/Token 进行登录。"
docker login

# 3. 执行 x86/AMD64 架构编译并推送
# 直接使用默认编译器进行单平台构建，完美避开自定义 Buildx 容器镜像 (moby/buildkit) 拉取失败问题！
echo -e "\n${YELLOW}🏗️ 正在使用默认编译器构建兼容云服务器的 x86/AMD64 镜像...${NC}"
echo -e "请稍候，正在编译... ☕"

DATE_TAG=$(date +%Y%m%d)

if docker build --platform linux/amd64 -t "${DOCKER_USER}/${IMAGE_NAME}:${TAG}" -t "${DOCKER_USER}/${IMAGE_NAME}:${DATE_TAG}" .; then
  echo -e "\n🚀 ${GREEN}本地编译完成！正在推送镜像至 Docker Hub...${NC}"
  
  if docker push "${DOCKER_USER}/${IMAGE_NAME}:${TAG}" && docker push "${DOCKER_USER}/${IMAGE_NAME}:${DATE_TAG}"; then
    echo -e "\n🎉 ${GREEN}恭喜！镜像已成功推送至 Docker Hub！${NC}"
    echo -e "📍 镜像地址: ${CYAN}https://hub.docker.com/r/${DOCKER_USER}/${IMAGE_NAME}${NC}"
  else
    echo -e "\n❌ ${RED}错误: 镜像推送失败，请检查网络或 Docker Hub 权限。${NC}"
    exit 1
  fi
else
  echo -e "\n❌ ${RED}错误: 镜像构建失败，请检查 Dockerfile 或网络。${NC}"
  exit 1
fi

# 5. 生成目标服务器部署文件
echo -e "\n${YELLOW}📄 正在本地为您生成服务器一键部署的 docker-compose.prod.yml ...${NC}"

cat <<EOF > docker-compose.prod.yml
version: '3.8'

services:
  basketball-tools:
    image: ${DOCKER_USER}/${IMAGE_NAME}:${TAG}
    container_name: basketball-tools
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATA_DIR=/app/data
      - PORT=3000
    volumes:
      - ./data:/app/data
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
EOF

echo -e "✅ ${GREEN}已成功生成 [docker-compose.prod.yml] 文件！${NC}"
echo -e "${CYAN}====================================================${NC}"
echo -e "📢 ${YELLOW}如何在远程云服务器上一键部署：${NC}"
echo -e "1. 将刚生成的 ${CYAN}docker-compose.prod.yml${NC} 复制到您的远程服务器上。"
echo -e "2. 在该文件所在目录下，直接运行这行命令启动服务："
echo -e "   ${GREEN}docker compose -f docker-compose.prod.yml up -d${NC}"
echo -e "3. 系统会自动从 Docker Hub 拉取最适合服务器架构的原生镜像并运行！"
echo -e "${CYAN}====================================================${NC}\n"
