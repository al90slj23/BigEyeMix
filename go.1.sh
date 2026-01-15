#!/bin/bash
# ================================================================
# 文件名: go.1.sh
# 中文名: 选项 1 - 部署（默认）
# 创建时间: 2025-01-15
# 更新时间: 2025-01-16
# ================================================================
#
# 【文件职责】
# 推送到 GitHub + 同步文件到服务器并重启服务
# 集成 DeepSeek AI 自动生成 Git 提交信息
#
# ================================================================

# 获取脚本目录并加载库函数
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/go.lib.sh"

# ============================================================
# AI 功能集成 (来自 go.ai.sh)
# ============================================================

# 通用 AI API 调用函数
call_ai_api() {
    local PROMPT="$1"
    local SYSTEM_PROMPT="${2:-你是一个专业的AI助手。}"
    local MAX_TOKENS="${3:-1200}"

    # 检查是否有内容
    if [ -z "$PROMPT" ]; then
        echo "错误：请提供 prompt" >&2
        return 1
    fi

    # 选择 API
    local API_KEY=""
    local API_URL=""
    local MODEL=""

    if [ -n "$APIKEY_MacOS_Code_DeepSeek" ]; then
        API_KEY="$APIKEY_MacOS_Code_DeepSeek"
        API_URL="https://api.deepseek.com/chat/completions"
        MODEL="deepseek-chat"
    elif [ -n "$APIKEY_MacOS_Code_MoonShot" ]; then
        API_KEY="$APIKEY_MacOS_Code_MoonShot"
        API_URL="https://api.moonshot.cn/v1/chat/completions"
        MODEL="moonshot-v1-8k"
    else
        echo "错误：未配置 AI API 密钥" >&2
        echo "请设置环境变量：APIKEY_MacOS_Code_DeepSeek 或 APIKEY_MacOS_Code_MoonShot" >&2
        return 1
    fi

    # 使用 Python 调用 API（处理 JSON 转义更可靠）
    python3 -c "
import json
import urllib.request
import sys

prompt = '''${PROMPT}'''
system_prompt = '''${SYSTEM_PROMPT}'''

data = {
    'model': '${MODEL}',
    'messages': [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': prompt}
    ],
    'temperature': 0.3,
    'max_tokens': ${MAX_TOKENS}
}

req = urllib.request.Request(
    '${API_URL}',
    data=json.dumps(data).encode('utf-8'),
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${API_KEY}'
    }
)

try:
    with urllib.request.urlopen(req, timeout=60) as response:
        result = json.loads(response.read().decode('utf-8'))
        print(result['choices'][0]['message']['content'].strip())
except urllib.error.HTTPError as e:
    print(f'HTTP错误: {e.code}', file=sys.stderr)
    sys.exit(1)
except urllib.error.URLError as e:
    print(f'网络错误: {e.reason}', file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f'错误: {e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null
}

# 生成 Git 提交摘要（专用函数）
get_ai_commit_message() {
    # 检查是否有变更
    if [ -z "$(git status --porcelain)" ]; then
        echo "chore: 自动部署 $(date '+%Y-%m-%d %H:%M')"
        return
    fi

    # 获取详细的变更信息
    local CHANGED_FILES=$(git diff --cached --name-status 2>/dev/null)
    if [ -z "$CHANGED_FILES" ]; then
        CHANGED_FILES=$(git diff --name-status 2>/dev/null)
    fi

    local DIFF_STAT=$(git diff --cached --stat 2>/dev/null)
    if [ -z "$DIFF_STAT" ]; then
        DIFF_STAT=$(git diff --stat 2>/dev/null)
    fi

    # 构建 prompt
    local PROMPT="你是一个专业的Git提交摘要生成专家。请根据以下变更信息，生成一个极其详细的Conventional Commits格式提交摘要。

变更文件状态（A=新增, M=修改, D=删除）:
${CHANGED_FILES}

变更统计（显示每个文件的增删行数）:
${DIFF_STAT}

生成要求:
1. 第一行: type: 简洁但准确的主标题
   - type必须从feat/fix/refactor/docs/style/chore中选择最合适的
   - 主标题要概括本次提交的核心内容

2. 第二行开始: 用'-'开头列出所有重要变更，要求:
   - 按功能模块分类（如：文档体系、组件重构、API更新、数据库迁移等）
   - 每个模块下列出具体的变更项
   - 对于新增文件(A)，明确说明新增了什么功能/文档
   - 对于修改文件(M)，说明修改了什么内容
   - 包含具体的文件名或目录名
   - 尽可能详细，但保持简洁

3. 格式示例:
docs: 完善文档体系架构，新增设计语言和实践指南
- 重构文档体系架构，明确 docs/standards/、docs/practices/、docs/logs/ 三层结构
- 新增 14-design-language.md 设计语言规范文档
- 更新所有规范文档保持一致性

4. 其他要求:
   - 中文输出
   - 总长度控制在1200字符内
   - 重点突出主要变更，次要变更可以合并描述"

    local SYSTEM_PROMPT="你是一个专业的Git提交摘要生成专家，擅长分析代码变更并生成详细准确的Conventional Commits格式提交信息。"

    # 调用 API
    local RESULT=$(call_ai_api "$PROMPT" "$SYSTEM_PROMPT" 1200)
    
    if [ -n "$RESULT" ]; then
        echo "$RESULT"
    else
        echo "chore: 自动部署 $(date '+%Y-%m-%d %H:%M')"
    fi
}

# 确认提交信息函数
confirm_commit_message() {
    local CURRENT_MSG="$1"

    while true; do
        printf "\n" >&2
        printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n" >&2
        printf "${GREEN}📌 AI 生成的提交摘要:${NC}\n" >&2
        printf "${YELLOW}   %s${NC}\n" "$CURRENT_MSG" >&2
        printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n" >&2
        printf "\n" >&2
        printf "${YELLOW}请选择操作:${NC}\n" >&2
        printf "  ${GREEN}1${NC} - 确认使用此摘要 (默认, 10秒后自动确认)\n" >&2
        printf "  ${YELLOW}2${NC} - 自定义输入摘要\n" >&2
        printf "  ${CYAN}0${NC} - 重新生成 AI 摘要\n" >&2
        printf "\n" >&2
        
        # 10秒超时，默认选择1；直接回车也是选择1
        read -t 10 -p "请输入选择 (1/2/0) [默认1]: " confirm_choice
        local read_status=$?
        
        # 超时(status=142)或直接回车(空值)都默认为1
        if [ $read_status -gt 128 ] || [ -z "$confirm_choice" ]; then
            confirm_choice="1"
            printf "\n${GREEN}⏱️  自动确认使用此摘要${NC}\n" >&2
        fi

        case $confirm_choice in
            1)
                echo "$CURRENT_MSG"
                break
                ;;
            2)
                printf "\n" >&2
                read -p "请输入自定义提交摘要: " CUSTOM_MSG
                if [ -n "$CUSTOM_MSG" ]; then
                    echo "$CUSTOM_MSG"
                    break
                else
                    printf "${RED}摘要不能为空，请重新选择${NC}\n" >&2
                fi
                ;;
            0)
                printf "\n" >&2
                printf "${CYAN}🤖 重新生成 AI 提交摘要...${NC}\n" >&2
                CURRENT_MSG=$(get_ai_commit_message)
                ;;
            *)
                printf "${RED}无效选择，请输入 1、2 或 0${NC}\n" >&2
                ;;
        esac
    done
}

step "部署 BigEyeMix（GitHub + 服务器）"

# 检查是否为测试模式
if [ "$1" = "--dry-run" ] || [ "$1" = "--test" ]; then
    echo -e "${YELLOW}⚠️  测试模式：只生成提交信息，不执行实际部署${NC}"
    DRY_RUN=true
else
    DRY_RUN=false
fi

# ============================================================
# 1. 推送到 GitHub
# ============================================================

step "推送到 GitHub..."

cd "$SCRIPT_DIR"

# ============================================================
# 1. 推送到 GitHub
# ============================================================

step "推送到 GitHub..."

cd "$SCRIPT_DIR"

# 检查是否有未提交的更改
if [ -n "$(git status --porcelain)" ]; then
    info "检测到未提交的更改"
    git add -A
    
    # 生成 AI 提交摘要并交互确认
    echo -e "${CYAN}🤖 正在生成 AI 提交摘要...${NC}"
    AI_COMMIT_MSG=$(get_ai_commit_message)
    commit_msg=$(confirm_commit_message "$AI_COMMIT_MSG")
    
    echo ""
    echo -e "${GREEN}📌 最终提交信息: ${CYAN}$commit_msg${NC}"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}🧪 测试模式：跳过实际 git commit${NC}"
    else
        git commit -m "$commit_msg"
    fi
else
    info "没有未提交的更改"
fi

# 如果是测试模式，在这里退出
if [ "$DRY_RUN" = true ]; then
    echo -e "${GREEN}✅ 测试完成！AI 提交信息生成正常工作${NC}"
    exit 0
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
