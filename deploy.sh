#!/bin/bash

# ==========================================================================
# 🏀 篮球比赛管理工具 Docker 一键部署脚本 (deploy.sh)
# ==========================================================================

# 终端彩色配置
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}====================================================${NC}"
echo -e "  🏀 ${YELLOW}篮球比赛管理工具 (Basketball Tools)${NC} 一键部署启动中..."
echo -e "${CYAN}====================================================${NC}"

# 1. 检查 Docker 安装情况
if ! [ -x "$(command -v docker)" ]; then
  echo -e "❌ ${RED}错误: 未检测到 Docker，请先安装 Docker (https://www.docker.com/)${NC}"
  exit 1
fi

if ! [ -x "$(command -v docker-compose)" ] && ! docker compose version &>/dev/null; then
  echo -e "❌ ${RED}错误: 未检测到 Docker Compose 插件，请先安装 Docker Compose。${NC}"
  exit 1
fi

# 2. 拉取子模块最新代码（main 分支）
echo -e "\n${YELLOW}🔄 正在拉取子模块 (worldCupTool) 最新代码 (main 分支)...${NC}"
git submodule update --init --remote --merge
if [ $? -eq 0 ]; then
  echo -e "✅ ${GREEN}子模块更新成功！${NC}"
else
  echo -e "⚠️  ${YELLOW}警告: 子模块更新失败，将使用当前已有版本继续部署。${NC}"
fi

# 3. 清理可能存在的旧容器，防止端口冲突
echo -e "\n${YELLOW}🔄 正在清理旧版本的容器和缓存...${NC}"
docker compose down

# 4. 编译并后台启动容器
echo -e "\n${YELLOW}🏗️ 正在构建 Docker 镜像并启动容器 (后台运行)...${NC}"
if docker compose up -d --build; then
  echo -e "✅ ${GREEN}容器启动成功！${NC}"
else
  echo -e "❌ ${RED}错误: 构建或启动失败，请检查 Docker 日志。${NC}"
  exit 1
fi

# 5. 获取局域网 IP 以方便手机或多端真机测试
LOCAL_IP="127.0.0.1"
if [[ "$OSTYPE" == "darwin"* ]]; then
  # Mac 环境
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
else
  # Linux/Unix 环境
  LOCAL_IP=$(hostname -I | awk '{print $1}')
fi

# 6. 展示精美的部署结果
echo -e "\n${CYAN}====================================================${NC}"
echo -e "🎉 ${GREEN}部署成功！项目已在 Docker 容器中平稳运行！${NC}"
echo -e "${CYAN}====================================================${NC}"
echo -e "🏠 ${GREEN}电脑端浏览器访问: ${CYAN}http://localhost:3000${NC}"

if [ ! -z "$LOCAL_IP" ]; then
  echo -e "📱 ${GREEN}手机端 / 同局域网访问: ${CYAN}http://${LOCAL_IP}:3000${NC}"
else
  echo -e "📱 ${GREEN}手机端测试：请使用您电脑的局域网 IP + 端口 :3000${NC}"
fi

echo -e "💾 ${GREEN}数据持久化文件夹: ${CYAN}./data/ (所有比分、赛程与裁判锁均会安全保存在此)${NC}"
echo -e "${CYAN}====================================================${NC}"
echo -e "💡 常用维护命令指南："
echo -e "   • ${YELLOW}查看容器实时日志:${NC}  docker compose logs -f"
echo -e "   • ${YELLOW}停止并销毁服务:${NC}    docker compose down"
echo -e "   • ${YELLOW}重启服务:${NC}        docker compose restart"
echo -e "${CYAN}====================================================${NC}\n"
