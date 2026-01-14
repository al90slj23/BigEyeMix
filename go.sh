#!/bin/bash
# ================================================================
# 文件名: go.sh
# 中文名: BigEyeMix 统一入口脚本
# 创建时间: 2025-01-15
# ================================================================
#
# 【文件职责】
# 项目统一命令入口，通过数字选项快速执行常用操作
#
# 【选项说明】
# 0 = 本地开发环境
# 1 = 部署（默认，GitHub + 服务器）
# 2 = 检查服务状态
# 3 = 清理临时文件
#
# 【使用方式】
# ./go.sh        # 交互式菜单（10秒无输入自动执行选项1）
# ./go.sh 1      # 直接执行选项 1
#
# ================================================================

# 加载通用库
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/go.lib.sh"

# 显示菜单
show_menu() {
    echo ""
    echo "================================"
    echo "    BigEyeMix 项目管理"
    echo "================================"
    echo ""
    echo "请选择操作："
    echo "  0. 本地开发（启动前后端服务）"
    echo "  1. 部署（GitHub + 服务器）[默认]"
    echo "  2. 检查服务状态"
    echo "  3. 清理临时文件"
    echo ""
}

# 主逻辑
main() {
    local choice=$1

    # 如果没有传入参数，显示菜单
    if [ -z "$choice" ]; then
        show_menu
        read -t 10 -p "请输入选项 [1]: " choice
        echo ""
        choice=${choice:-1}
    fi

    case $choice in
        0)
            source "$SCRIPT_DIR/go.0.sh"
            ;;
        1)
            source "$SCRIPT_DIR/go.1.sh"
            ;;
        2)
            source "$SCRIPT_DIR/go.2.sh"
            ;;
        3)
            source "$SCRIPT_DIR/go.3.sh"
            ;;
        *)
            error "无效选项: $choice"
            exit 1
            ;;
    esac
}

main "$1"
