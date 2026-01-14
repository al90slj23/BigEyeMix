#!/bin/bash
# ================================================================
# 文件名: go.1.sh
# 中文名: 选项 1 - 部署（默认）
# 创建时间: 2025-01-15
# ================================================================
#
# 【文件职责】
# 推送到 GitHub + 同步文件到服务器并重启服务
#
# ================================================================

step "部署 BigEyeMix（GitHub + 服务器）"

# ============================================================
# 1. 推送到 GitHub
# ============================================================

step "推送到 GitHub..."

cd "$SCRIPT_DIR"

# 检查是否有未提交的更改
if [ -n "$(git status --porcelain)" ]; then
    info "检测到未提交的更改"
    git add -A
    read -p "请输入 commit 信息 [update]: " commit_msg
    commit_msg=${commit_msg:-update}
    git commit -m "$commit_msg"
fi

# 推送到远程
git push origin main

if [ $? -eq 0 ]; then
    success "GitHub 推送完成"
else
    error "GitHub 推送失败"
    exit 1
fi

# ============================================================
# 2. 同步 web/ 目录
# ============================================================

step "同步 web/ 目录..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.DS_Store' \
    "$SCRIPT_DIR/web/" ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/web/

if [ $? -eq 0 ]; then
    success "web/ 同步完成"
else
    error "web/ 同步失败"
    exit 1
fi

# ============================================================
# 3. 同步 api/ 目录
# ============================================================

step "同步 api/ 目录..."
rsync -avz --delete \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.env' \
    --exclude 'venv' \
    --exclude 'uploads' \
    --exclude 'outputs' \
    "$SCRIPT_DIR/api/" ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/api/

if [ $? -eq 0 ]; then
    success "api/ 同步完成"
else
    error "api/ 同步失败"
    exit 1
fi

# ============================================================
# 4. 更新 Nginx 配置
# ============================================================

step "更新 Nginx 配置..."
scp "$SCRIPT_DIR/deploy/bem.it.sc.cn.conf" ${SERVER_USER}@${SERVER_HOST}:/www/server/panel/vhost/nginx/bem.it.sc.cn.conf

if [ $? -eq 0 ]; then
    success "Nginx 配置更新完成"
else
    error "Nginx 配置更新失败"
    exit 1
fi

# ============================================================
# 5. 更新 PM2 配置
# ============================================================

step "更新 PM2 配置..."
scp "$SCRIPT_DIR/deploy/pm2.config.js" ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/deploy/pm2.config.js

if [ $? -eq 0 ]; then
    success "PM2 配置更新完成"
else
    warn "PM2 配置更新失败（可能目录不存在）"
fi

# ============================================================
# 6. 重启服务
# ============================================================

step "重启服务..."
ssh ${SERVER_USER}@${SERVER_HOST} << 'ENDSSH'
    # 重启 Nginx
    echo "重启 Nginx..."
    nginx -t && nginx -s reload
    
    # 重启 PM2
    echo "重启 PM2..."
    cd /www/wwwroot/bem.it.sc.cn
    pm2 delete bigeye.api 2>/dev/null || true
    pm2 start deploy/pm2.config.js
    pm2 save
    
    echo "服务重启完成"
ENDSSH

if [ $? -eq 0 ]; then
    success "服务重启完成"
else
    error "服务重启失败"
    exit 1
fi

# ============================================================
# 7. 显示结果
# ============================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
success "部署完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "访问地址："
echo "  首页: https://bem.it.sc.cn/"
echo "  麻瓜模式: https://bem.it.sc.cn/muggle"
echo "  巫师模式: https://bem.it.sc.cn/wizard"
echo "  API 文档: https://bem.it.sc.cn/api/docs"
echo ""
echo "检查服务状态: ./go.sh 2"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
