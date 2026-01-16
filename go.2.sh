#!/bin/bash
# ================================================================
# 文件名: go.2.sh
# 中文名: 选项 2 - 检查服务状态
# 创建时间: 2025-01-15
# ================================================================
#
# 【文件职责】
# 检查服务器上的服务状态
#
# ================================================================

step "检查 BigEyeMix 服务状态"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 PM2 进程状态"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh ${SERVER_USER}@${SERVER_HOST} 'pm2 status'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Nginx 状态"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh ${SERVER_USER}@${SERVER_HOST} 'nginx -t 2>&1'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 服务连通性测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 测试首页
if curl -s -o /dev/null -w "%{http_code}" https://bem.it.sc.cn/ | grep -q "200"; then
    success "首页: https://bem.it.sc.cn/"
else
    error "首页: https://bem.it.sc.cn/"
fi

# 测试麻瓜模式（接受 200 或 301 重定向）
if curl -s -o /dev/null -w "%{http_code}" https://bem.it.sc.cn/muggle/ | grep -q "200"; then
    success "麻瓜模式: https://bem.it.sc.cn/muggle/"
else
    error "麻瓜模式: https://bem.it.sc.cn/muggle/"
fi

# 测试巫师模式（接受 200 或 301 重定向）
if curl -s -o /dev/null -w "%{http_code}" https://bem.it.sc.cn/wizard/ | grep -q "200"; then
    success "巫师模式: https://bem.it.sc.cn/wizard/"
else
    error "巫师模式: https://bem.it.sc.cn/wizard/"
fi

# 测试 API
if curl -s -o /dev/null -w "%{http_code}" https://bem.it.sc.cn/api/health | grep -q "200"; then
    success "API 健康检查: https://bem.it.sc.cn/api/health"
else
    error "API 健康检查: https://bem.it.sc.cn/api/health"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 最近日志 (最后 20 行)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh ${SERVER_USER}@${SERVER_HOST} 'pm2 logs bigeye.api --lines 20 --nostream' 2>/dev/null || warn "无法获取日志"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💾 磁盘使用情况"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh ${SERVER_USER}@${SERVER_HOST} 'df -h /www/wwwroot/bem.it.sc.cn'

echo ""
success "检查完成"
