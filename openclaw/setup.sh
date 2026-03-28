#!/bin/bash
# ─── SCI Visualizer — OpenClaw + GeWe 微信助手一键安装脚本 ───
#
# 在服务器上运行：
#   cd /home/deploy/VASP-Visualizer/openclaw && bash setup.sh
#
# 前置条件：
#   - Docker + Docker Compose 已安装
#   - 服务器有公网 IP
#   - SCI Visualizer 后端已在 3000 端口运行

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "================================================="
echo "  SCI Visualizer — OpenClaw 微信助手安装"
echo "================================================="

# ── Step 1: 读取 Gemini API 配置（从 SCI Visualizer 的 .env）
SCI_ENV="../server/.env"
if [ -f "$SCI_ENV" ]; then
  GEMINI_API_KEY=$(grep '^GEMINI_API_KEY=' "$SCI_ENV" | cut -d= -f2)
  GEMINI_BASE_URL=$(grep '^GEMINI_BASE_URL=' "$SCI_ENV" | cut -d= -f2)
  GEMINI_TEXT_MODEL=$(grep '^GEMINI_TEXT_MODEL=' "$SCI_ENV" | cut -d= -f2)
  echo "[✓] 从 server/.env 读取 Gemini 配置"
else
  echo "[!] 未找到 $SCI_ENV，使用默认值"
  GEMINI_API_KEY=""
  GEMINI_BASE_URL=""
  GEMINI_TEXT_MODEL=""
fi

# 确保使用正确的配置（覆盖旧值）
GEMINI_BASE_URL="${GEMINI_BASE_URL:-https://api.aipaibox.com/v1}"
GEMINI_TEXT_MODEL="${GEMINI_TEXT_MODEL:-gemini-2.5-flash}"

# 如果 Base URL 是旧的 novai.su，自动修正
if echo "$GEMINI_BASE_URL" | grep -q "novai.su"; then
  GEMINI_BASE_URL="https://api.aipaibox.com/v1"
  echo "[!] 检测到旧 Base URL，已自动修正为 aipaibox"
fi
if echo "$GEMINI_TEXT_MODEL" | grep -q "gemini-3"; then
  GEMINI_TEXT_MODEL="gemini-2.5-flash"
  echo "[!] 检测到旧模型名，已自动修正为 gemini-2.5-flash"
fi

echo "    API Key: ${GEMINI_API_KEY:0:10}..."
echo "    Base URL: $GEMINI_BASE_URL"
echo "    Model: $GEMINI_TEXT_MODEL"

# ── Step 2: 同步修正 server/.env 中的旧配置
if [ -f "$SCI_ENV" ]; then
  sed -i 's|GEMINI_BASE_URL=https://once.novai.su/v1|GEMINI_BASE_URL=https://api.aipaibox.com/v1|g' "$SCI_ENV"
  sed -i 's|GEMINI_TEXT_MODEL=gemini-3-flash-preview|GEMINI_TEXT_MODEL=gemini-2.5-flash|g' "$SCI_ENV"
  echo "[✓] 已同步修正 server/.env"
fi

# ── Step 4: 写入 .env 给 docker-compose 使用
cat > .env <<EOF
GEMINI_API_KEY=$GEMINI_API_KEY
GEMINI_BASE_URL=$GEMINI_BASE_URL
GEMINI_TEXT_MODEL=$GEMINI_TEXT_MODEL
EOF
echo "[✓] 生成 .env 文件"

# ── Step 3: 替换 openclaw.json 中的变量占位符
CONFIG_FILE="config/openclaw.json"
if [ -f "$CONFIG_FILE" ]; then
  sed -i "s|\${GEMINI_API_KEY}|$GEMINI_API_KEY|g" "$CONFIG_FILE"
  sed -i "s|\${GEMINI_BASE_URL}|$GEMINI_BASE_URL|g" "$CONFIG_FILE"
  echo "[✓] 配置文件变量替换完成"
else
  echo "[✗] 未找到 $CONFIG_FILE"
  exit 1
fi

# ── Step 4: 创建必要目录
mkdir -p workspace logs gewe-data
echo "[✓] 创建数据目录"

# ── Step 5: 启动容器
echo ""
echo "正在拉取镜像并启动容器..."
docker compose up -d
echo ""

# ── Step 6: 等待服务启动
echo "等待服务启动..."
sleep 10

# ── Step 7: 检查状态
echo ""
echo "================================================="
echo "  安装完成！"
echo "================================================="
echo ""
docker compose ps
echo ""
echo "┌─────────────────────────────────────────────────┐"
echo "│  OpenClaw 管理面板: http://$(hostname -I | awk '{print $1}'):18789       │"
echo "│  GeWe 服务: http://$(hostname -I | awk '{print $1}'):2531              │"
echo "└─────────────────────────────────────────────────┘"
echo ""
echo "下一步："
echo "  1. 打开 OpenClaw 管理面板"
echo "  2. 进入 GeWe 设置，用手机微信扫码登录"
echo "  3. 扫码后即可在微信中发消息控制 SCI Visualizer"
echo ""
echo "示例微信消息："
echo '  "搜文献 NaCoO2 正极材料掺杂"  → 调用 Idea Agent'
echo '  "建模 NaCoO2 bulk"            → 调用 Modeling Agent'
echo '  "服务器状态"                   → 查看 Docker 状态'
echo '  "部署"                        → 一键拉取最新代码并部署'
echo ""
