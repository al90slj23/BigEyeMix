# BigEyeMix 前端 JS 文件拆分规范

> **文档版本**：v1.0.0
> **创建日期**：2025-01-15
> **基于**：ZERO Framework 03.frontend-01.structure

---

## 📍 文档定位

本文档定义 BigEyeMix 项目前端 JavaScript 文件的拆分规范，遵循 ZERO 架构标准。

---

## 🎯 核心原则

1. **单文件行数控制**：推荐 300-500 行，上限 700 行，超过 800 行强制拆分
2. **职责分离**：配置、工具、业务逻辑分离
3. **点分命名**：`FeatureName.FileType.js`

---

## 📋 文件拆分结构

### 麻瓜模式（Muggle）示例

```
web/muggle/
├── index.html              # 设备检测入口
├── index.pc.html           # PC 端页面
├── index.mobile.html       # 移动端页面
│
│   # JS 模块（按加载顺序）
├── Muggle.config.js        # 配置与状态管理
├── Muggle.utils.js         # 工具函数
├── Muggle.upload.js        # 上传功能
├── Muggle.history.js       # 历史文件管理
├── Muggle.editor.js        # 波形编辑器
├── Muggle.timeline.js      # 时间线拖拽
└── Muggle.logic.js         # 主逻辑入口
```

---

## 📁 文件职责定义

### 配置文件 - `FeatureName.config.js`

**职责**：全局配置、状态管理、常量定义

**内容**：
- API 基础地址
- 全局状态对象 `state`
- 预设常量（如 `gapPresets`）
- 配置项

**行数限制**：50-100 行

### 工具文件 - `FeatureName.utils.js`

**职责**：通用工具函数

**内容**：
- 格式化函数（`formatTime`、`parseTime`）
- DOM 操作辅助（`refreshIcons`）
- 数据处理工具

**行数限制**：50-150 行

### 功能模块 - `FeatureName.{Module}.js`

**职责**：独立功能模块

**命名规则**：
| 模块 | 文件名 | 职责 |
|------|--------|------|
| 上传 | `Muggle.upload.js` | 文件上传、进度显示 |
| 历史 | `Muggle.history.js` | 历史文件列表、选择 |
| 编辑器 | `Muggle.editor.js` | 波形显示、片段管理 |
| 时间线 | `Muggle.timeline.js` | 拖拽排序、组合 |

**行数限制**：150-300 行

### 主逻辑 - `FeatureName.logic.js`

**职责**：入口初始化、导航控制、核心业务流程

**内容**：
- `DOMContentLoaded` 初始化
- 步骤导航（`nextStep`、`prevStep`）
- 核心业务处理（如 `startMixing`）

**行数限制**：150-250 行

---

## 📜 加载顺序

HTML 中 JS 文件必须按依赖顺序加载：

```html
<!-- 第三方库 -->
<script src="axios.min.js"></script>
<script src="wavesurfer.js"></script>

<!-- 项目模块（按依赖顺序） -->
<script src="Muggle.config.js"></script>   <!-- 1. 配置（无依赖） -->
<script src="Muggle.utils.js"></script>    <!-- 2. 工具（无依赖） -->
<script src="Muggle.upload.js"></script>   <!-- 3. 上传（依赖 config, utils） -->
<script src="Muggle.history.js"></script>  <!-- 4. 历史（依赖 config, utils, upload） -->
<script src="Muggle.editor.js"></script>   <!-- 5. 编辑器（依赖 config, utils） -->
<script src="Muggle.timeline.js"></script> <!-- 6. 时间线（依赖 config, utils） -->
<script src="Muggle.logic.js"></script>    <!-- 7. 主逻辑（依赖所有模块） -->
```

---

## 📏 行数标准

| 文件类型 | 推荐 | 上限 | 强制重构 |
|---------|------|------|---------|
| 配置文件 | 50-100 | 150 | >200 |
| 工具文件 | 50-150 | 200 | >250 |
| 功能模块 | 150-300 | 400 | >500 |
| 主逻辑 | 150-250 | 350 | >450 |
| **单文件总计** | **300-500** | **700** | **>800** |

---

## 🔧 拆分触发条件

当出现以下情况时，必须进行拆分：

1. **单文件超过 700 行**
2. **单个功能模块超过 400 行**
3. **文件包含 3 个以上独立功能区域**
4. **函数超过 80 行**

---

## ✅ 检查清单

- [ ] 单文件行数 ≤ 700
- [ ] 配置与业务逻辑分离
- [ ] 工具函数独立文件
- [ ] 功能模块职责单一
- [ ] 加载顺序正确
- [ ] 文件命名符合点分规范

---

**最后更新**：2025-01-15
