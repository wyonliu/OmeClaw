#!/bin/bash

# OmeClaw 多用户测试一键启动脚本

echo "🪼 OmeClaw 多用户测试环境启动"
echo "================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，请先安装 Node.js 18+"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 构建项目
echo "🔨 构建项目..."
npm run build

# 清理旧数据（可选）
read -p "是否清理旧数据？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 清理旧数据..."
    rm -rf .omeclaw
fi

# 启动服务器
echo ""
echo "🚀 启动服务器..."
echo ""
echo "================================"
echo "📊 Dashboard:   http://localhost:3000"
echo "🔌 API:         http://localhost:3000/api/status"
echo "🔄 WebSocket:   ws://localhost:3000/ws"
echo "================================"
echo ""
echo "🧪 测试账号建议："
echo "  用户1: alice / password123"
echo "  用户2: bob / password123"
echo "  用户3: charlie / password123"
echo ""
echo "📝 测试流程："
echo "  1. 打开浏览器访问 http://localhost:3000"
echo "  2. 注册新用户"
echo "  3. 选择 Ome 模板并领养"
echo "  4. 开始对话和互动"
echo "  5. 在 OmeLand 发布动态"
echo "  6. 关注其他用户的 Ome"
echo ""
echo "按 Ctrl+C 停止服务器"
echo "================================"
echo ""

npm start
