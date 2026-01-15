# BigEyeMix 前端命名规范

## 1. 文件命名

### ZERO 框架规范

- 使用点号 `.` 分隔，不使用连字符 `-`
- 格式：`模块.功能.js` 或 `模块.功能.子功能.js`

```
✓ Muggle.timeline.js
✓ Muggle.timeline.drag.js
✓ Muggle.timeline.magic.js
✗ Muggle-timeline.js
✗ muggle_timeline.js
```

### CSS 文件

- 与 JS 文件对应
- 放在同一目录，不建子文件夹

```
web/muggle/
├── Muggle.base.css
├── Muggle.upload.css
├── Muggle.editor.css
├── Muggle.timeline.css
├── Muggle.modal.css
└── Muggle.effects.css
```

## 2. 变量命名

### 过渡相关

| 中文 | 英文变量名 | 说明 |
|------|-----------|------|
| 过渡 | transition | 两段音频之间的衔接 |
| 过渡类型 | transitionType | magicfill/beatsync/crossfade/silence |
| 过渡时长 | transitionDuration | 秒数 |
| 过渡块 | transitionBlock | 可拖拽的过渡预设 |

### 过渡类型

| 类型 | 变量值 | 中文名 |
|------|--------|--------|
| 魔法填充 | magicfill | AI 生成过渡音频 |
| 节拍对齐 | beatsync | 基于 BPM 对齐 |
| 淡出淡入 | crossfade | 音量渐变 |
| 休止静音 | silence | 无声过渡 |

### 片段标签

- 使用大写字母：A1, B1, C2
- 轨道用字母：A, B, C...
- 片段用数字：1, 2, 3...

## 3. UI 术语

| 位置 | 中文名 | 说明 |
|------|--------|------|
| 上方波形 | 主波形 | 可缩放、可拖拽定位 |
| 下方波形 | 导航条 | 全局视图 + 视口指示 |

## 4. 时间格式

统一使用 `mm:ss.cc` 格式：

```javascript
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const cents = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${cents.toString().padStart(2, '0')}`;
}
// 输出示例：25:31.38
```

## 5. 颜色规范

### 轨道颜色（红橙黄绿青蓝紫）

```javascript
const trackColors = [
    { name: 'red',    bg: '#ef4444' },
    { name: 'orange', bg: '#f97316' },
    { name: 'yellow', bg: '#eab308' },
    { name: 'green',  bg: '#22c55e' },
    { name: 'cyan',   bg: '#06b6d4' },
    { name: 'blue',   bg: '#3b82f6' },
    { name: 'purple', bg: '#8b5cf6' }
];
```

### 过渡类型颜色

```javascript
const transitionTypes = {
    magicfill: { color: '#8b5cf6' },  // 紫色
    beatsync:  { color: '#ec4899' },  // 粉色
    crossfade: { color: '#f59e0b' },  // 橙色
    silence:   { color: '#6b7280' }   // 灰色
};
```

## 6. 版本号管理

CSS/JS 文件使用查询参数版本号：

```html
<link rel="stylesheet" href="/muggle/Muggle.base.css?v=24">
<script src="/muggle/Muggle.config.js?v=24"></script>
```

每次修改后递增版本号，确保浏览器加载最新文件。
