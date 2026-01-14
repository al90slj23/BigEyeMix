# BigEyeMix 👁️ 大眼怪の混剪平台

> **定位**：AI 驱动的智能音乐混音平台
> **版本**：v1.0.0
> **规范**：遵循 ZERO 框架规范

---

## 🎯 项目简介

BigEyeMix 是一个现代化的在线音频编辑混音平台，提供两种模式：

- **麻瓜模式**：简单直观，3步完成混音剪辑，适合大眼怪脑子不好用的时候
- **巫师模式**：完整编辑，完整模式音频编辑，适合大眼怪清醒想认真的时候

---

## 🚀 快速开始

### 使用 go.sh（推荐）

```bash
./go.sh        # 交互式菜单（10秒无输入自动部署）
./go.sh 0      # 本地开发
./go.sh 1      # 部署（默认）
./go.sh 2      # 检查服务状态
./go.sh 3      # 清理临时文件
```

### 手动启动

```bash
# 后端
cd api && source venv/bin/activate && uvicorn main:app --reload --port 8000

# 前端
cd web && python3 -m http.server 8080
```

---

## 📁 项目结构

```
BigEyeMix/
├── go.sh                   # 统一入口脚本
├── go.lib.sh               # 通用库
├── go.0.sh                 # 本地开发
├── go.1.sh                 # 部署（默认）
├── go.2.sh                 # 状态检查
├── go.3.sh                 # 清理
├── README.md               # 本文件
│
├── web/                    # 前端（静态文件）
│   ├── home/              # 首页（模式选择）
│   ├── muggle/            # 麻瓜模式
│   └── wizard/            # 巫师模式
│
├── api/                   # 后端（Python FastAPI）
│   ├── app/
│   │   ├── api/          # API 路由
│   │   ├── core/         # 核心配置
│   │   ├── models/       # 数据模型
│   │   └── services/     # 业务逻辑
│   └── main.py
│
├── deploy/                # 部署配置
│   ├── bem.it.sc.cn.conf # Nginx 配置
│   └── pm2.config.js     # PM2 配置
│
├── docs/                  # 文档
│   ├── 01.arch.structure.md    # 架构文档
│   ├── 02.deploy.guide.md      # 部署指南
│   └── 03.reference.commands.md # 命令参考
│
└── ZERO/                  # ZERO 框架规范（参考）
```

---

## 🌐 访问地址

| 页面 | URL |
|------|-----|
| 首页 | https://bem.it.sc.cn/ |
| 麻瓜模式 | https://bem.it.sc.cn/muggle |
| 巫师模式 | https://bem.it.sc.cn/wizard |
| API 文档 | https://bem.it.sc.cn/api/docs |

---

## 📡 API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/upload` | POST | 上传音频文件 |
| `/api/mix` | POST | 混音处理 |
| `/api/download:id` | GET | 下载混音结果 |
| `/api/health` | GET | 健康检查 |

---

## 🛠️ 技术栈

### 前端
- HTML + CSS + JavaScript
- axios (HTTP 客户端)

### 后端
- Python 3.11 + FastAPI
- librosa (音频分析)
- pydub (音频处理)
- ffmpeg (音频编解码)

### 基础设施
- Nginx (反向代理)
- PM2 (进程管理)
- SSL/HTTPS

---

## 📖 文档

| 文档 | 说明 |
|------|------|
| [架构文档](docs/01.arch.structure.md) | 系统架构和数据流程 |
| [部署指南](docs/02.deploy.guide.md) | 部署步骤和故障排查 |
| [命令参考](docs/03.reference.commands.md) | 常用命令速查 |

---

## 🗺️ 路线图

### 短期
- [x] 麻瓜模式基础功能
- [x] 4种混音场景
- [x] 文件上传和下载
- [ ] 波形预览
- [ ] 音频播放器

### 中期
- [ ] 集成 AudioMass 专业模式
- [ ] 用户系统
- [ ] 任务队列

### 长期
- [ ] AI 智能混音
- [ ] 批量处理
- [ ] 移动端 App

---

## 📋 命名规范

本项目遵循 ZERO 框架规范：

| 场景 | 风格 | 举例 |
|------|------|------|
| 目录路径 | 全小写 | `web/muggle/` |
| 文件名 | 点分命名 | `Muggle.view.html` |
| 变量/函数 | camelCase | `userName` |
| 类名 | PascalCase | `AudioService` |
| 数据库表 | 下划线 | `audio_files` |
| API路由 | 冒号语法 | `/api/download:id` |

---

## 📄 许可证

MIT License

---

**最后更新**：2025-01-15
