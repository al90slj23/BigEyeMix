# BigEyeMix 部署与开发经验总结

## 1. 本地开发 vs 服务器环境

### 问题：魔法填充需要公网可访问的音频 URL

PiAPI ACE-Step 需要通过公网 URL 访问音频文件，本地 localhost 无法被外部访问。

**解决方案**：本地开发时直接调用服务器 API

```javascript
// web/muggle/Muggle.config.js
const API_BASE = 'https://bem.it.sc.cn';
```

### CORS 配置

服务器需要允许 localhost 跨域访问：

```bash
# api/.env
CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080,http://bem.it.sc.cn,https://bem.it.sc.cn
```

## 2. Nginx 配置要点

### API 路由优先级

使用 `^~` 前缀确保 `/api` 路由优先于静态资源正则规则：

```nginx
# 正确 - API 优先
location ^~ /api {
    proxy_pass http://localhost:8000;
    ...
}

# 静态资源规则（会被 ^~ 覆盖）
location ~ .*\.(gif|jpg|mp3|flac|wav)$ {
    expires 12h;
}
```

### 常见问题

- 静态资源规则 `~ .*\.(mp3|flac|wav)$` 会拦截 `/api/audio/*.mp3` 请求
- 解决：给 `/api` 添加 `^~` 前缀提升优先级

## 3. PM2 + Python venv

### 配置示例

```javascript
// deploy/pm2.config.js
module.exports = {
  apps: [{
    name: 'BigEyeMix-API',
    cwd: '/www/wwwroot/bem.it.sc.cn/api',
    script: '/www/wwwroot/bem.it.sc.cn/venv/bin/python',  // 使用 venv 的 python
    args: '-m uvicorn main:app --host 0.0.0.0 --port 8000',
    ...
  }]
};
```

### 常见错误

```
No module named uvicorn
```

**原因**：PM2 使用了系统 python 而不是 venv

**解决**：
1. 确保 `script` 指向 venv 的 python 路径
2. 安装依赖：`source venv/bin/activate && pip install -r api/requirements.txt`
3. 重启：`pm2 restart BigEyeMix-API --update-env`

## 4. 部署脚本排除规则

`go.1.sh` 中 rsync 排除了数据目录：

```bash
rsync -avz --delete \
    --exclude 'uploads' \   # 用户上传的文件
    --exclude 'outputs' \   # 生成的混音文件
    "$SCRIPT_DIR/api/" ...
```

**注意**：测试用的音频文件需要手动上传到服务器

```bash
scp "api/data/uploads/xxx.mp3" root@bem.it.sc.cn:/www/wwwroot/bem.it.sc.cn/data/uploads/
```

## 5. 服务器目录结构

```
/www/wwwroot/bem.it.sc.cn/
├── api/                    # FastAPI 后端代码
│   └── .env               # 环境配置（不同步）
├── data/
│   ├── uploads/           # 用户上传的音频
│   └── outputs/           # 生成的混音文件
│       ├── cache/         # 格式转换缓存
│       └── temp/          # 临时文件（魔法填充片段）
├── venv/                  # Python 虚拟环境
├── web/                   # 前端静态文件
└── deploy/                # 部署配置
```

## 6. 调试技巧

### 查看 PM2 日志

```bash
pm2 logs BigEyeMix-API --lines 20 --nostream
```

### 测试 API 连通性

```bash
# 本地测试
curl http://localhost:8000/api/uploads

# 服务器内部测试
ssh root@server "curl http://localhost:8000/"

# 公网测试
curl https://bem.it.sc.cn/api/uploads
```

### 重启服务

```bash
pm2 restart BigEyeMix-API --update-env  # 重新加载环境变量
nginx -t && nginx -s reload              # 重载 nginx 配置
```
