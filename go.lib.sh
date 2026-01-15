#!/bin/bash
# ================================================================
# 文件名: go.lib.sh
# 中文名: 通用库
# 创建时间: 2025-01-15
# ================================================================
#
# 【文件职责】
# 提供颜色定义和通用工具函数
#
# ================================================================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[1;36m'
MAGENTA='\033[1;35m'
NC='\033[0m'

# 输出函数
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
step() { echo -e "${CYAN}📌 $1${NC}"; }

# 检查命令是否存在
check_command() {
    if ! command -v "$1" &> /dev/null; then
        error "$1 未安装"
        if [ -n "$2" ]; then
            info "安装方法: $2"
        fi
        return 1
    fi
    return 0
}

# 检查端口是否被占用
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # 端口被占用
    fi
    return 1  # 端口空闲
}

# 杀死占用端口的进程
kill_port() {
    local port=$1
    local pid=$(lsof -ti:$port)
    if [ -n "$pid" ]; then
        kill -9 $pid 2>/dev/null
        success "已释放端口 $port"
    fi
}

# 确认操作
confirm() {
    read -p "$1 [y/N] " response
    case "$response" in
        [yY][eE][sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

# 服务器配置
SERVER_USER="root"
SERVER_HOST="bem.it.sc.cn"
SERVER_PATH="/www/wwwroot/bem.it.sc.cn"
