#!/bin/bash

# BigEyeMix 部署脚本
# 现代化架构：web/ + api/

set -e

echo "🚀 开始部署 BigEyeMix..."

PROJECT_DIR="/www/wwwroot/bem.it.sc.cn"

# 1. 部署 API（后端）
echo "📦 部署 API..."
cd $PROJECT_DIR/api

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 重启 API 服务
pm2 restart bigeye-api || pm2 start $PROJECT_DIR/deploy/pm2.config.js

echo "✅ API 部署完成"

# 2. 部署 Web（前端）
echo "🎨 部署 Web..."

# 2.1 部署向导模式
echo "  → 部署向导模式..."
# 向导模式是纯 HTML，无需构建

# 2.2 部署专业模式（AudioMass）
echo "  → 部署专业模式..."
if [ ! -d "$PROJECT_DIR/web/wizard" ]; then
    echo "  ⚠️  巫师模式未安装，跳过..."
fi

echo "✅ Web 部署完成"

# 3. 更新 Nginx 配置
echo "🔧 更新 Nginx..."
cp $PROJECT_DIR/deploy/bem.it.sc.cn.conf /www/server/panel/vhost/nginx/bem.it.sc.cn.conf
nginx -t && nginx -s reload

echo "✅ Nginx 配置更新完成"

# 4. 检查服务状态
echo "🔍 检查服务状态..."
pm2 list

echo ""
echo "🎉 部署完成！"
echo ""
echo "访问地址："
echo "  - 首页: https://bem.it.sc.cn/"
echo "  - 麻瓜模式: https://bem.it.sc.cn/muggle"
echo "  - 巫师模式: https://bem.it.sc.cn/wizard"
echo "  - API: https://bem.it.sc.cn/api"
echo ""
