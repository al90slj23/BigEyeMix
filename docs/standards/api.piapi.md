# PiAPI ACE-Step 集成指南

## 1. 概述

BigEyeMix 使用 PiAPI 的 ACE-Step 模型实现"魔法填充"功能，通过 AI 生成音频过渡。

## 2. API 配置

```bash
# api/.env
PIAPI_KEY=your_api_key_here
PIAPI_BASE_URL=https://api.piapi.ai
SERVER_PUBLIC_URL=https://bem.it.sc.cn  # 公网可访问的地址
```

## 3. 工作流程

```
1. 用户添加魔法填充过渡块
2. 前端调用 /api/magic/fill
3. 后端截取源音频片段（最后 10 秒）
4. 保存到 temp 目录，生成公网 URL
5. 调用 PiAPI extend 接口
6. 等待任务完成（60-120 秒）
7. 下载生成的音频
8. 返回结果给前端
```

## 4. API 调用示例

### 创建扩展任务

```python
payload = {
    "model": "Qubico/ace-step",
    "task_type": "extend",
    "input": {
        "audio": "https://bem.it.sc.cn/api/audio/segment.mp3",
        "right_extend_duration": 5,  # 向右扩展 5 秒
        "left_extend_duration": 0,
        "style_prompt": "smooth transition, same style",
        "lyrics": "[inst]"  # 纯音乐
    }
}

response = await client.post(
    "https://api.piapi.ai/api/v1/task",
    headers={"X-API-Key": api_key},
    json=payload
)
```

### 查询任务状态

```python
response = await client.get(
    f"https://api.piapi.ai/api/v1/task/{task_id}",
    headers={"X-API-Key": api_key}
)

status = response.json()["data"]["status"]
# pending -> processing -> completed/failed
```

## 5. 常见错误

### `failed to get input audio`

**原因**：PiAPI 无法访问提供的音频 URL

**排查**：
1. 确认 URL 是公网可访问的
2. 确认 nginx 配置正确（`^~` 优先级）
3. 测试：`curl -I https://your-domain/api/audio/xxx.mp3`

### 任务超时

**原因**：ACE-Step 生成通常需要 60-120 秒

**解决**：增加等待时间，默认 120 秒

## 6. 前端状态显示

### 状态流转

```
magic-loading  →  magic-complete  (成功)
                  magic-failed    (失败)
```

### CSS 效果

- `magic-loading`：彩虹跑马灯边框 + 图标旋转
- `magic-complete`：紫色渐变背景 + 烟花特效
- `magic-failed`：红色虚线边框 + 警告图标

## 7. 日志显示

魔法填充状态框显示实时进度：

```
09:40:41  开始生成 5s 过渡音频...
09:40:41  截取源音频 182.29s ~ 192.29s
09:40:41  调用 PiAPI ACE-Step 扩展 5s...
09:42:15  ✓ 生成完成: abc123.mp3
```

## 8. 本地开发注意事项

由于 PiAPI 需要公网可访问的音频 URL，本地开发时：

1. 前端 `API_BASE` 指向服务器
2. 服务器 CORS 允许 localhost
3. 音频文件需要上传到服务器

```javascript
// web/muggle/Muggle.config.js
const API_BASE = 'https://bem.it.sc.cn';
```
