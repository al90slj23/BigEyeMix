# AI 拼接接口标准 - 命令参数结构规范

## 概述

本文档定义了 AI 拼接功能的标准化命令参数接口结构。这套接口分为两部分：
1. **给人类看的**：`explanation` 字段，用于向用户展示拼接方案
2. **给机器看的**：`instructions` 字段，包含标准化的可执行指令

## 设计原则

### 1. 人机分离
- **人类可读**：`explanation` 使用自然语言描述，格式友好
- **机器可执行**：`instructions` 使用结构化 JSON，格式严格

### 2. 标准化
- 所有指令必须符合预定义的数据模型
- 使用 Pydantic 进行类型验证和约束
- 确保指令可以直接被音频处理引擎执行

### 3. 可验证
- 每个指令都会经过多层验证
- 验证失败时提供明确的错误信息
- 不使用模拟响应或保底机制

---

## 接口定义

### 请求格式

```json
{
  "prompt": "构建的完整提示词",
  "system_prompt": "系统角色定义",
  "context": {
    "tracks": [
      {
        "id": 1,
        "label": "A",
        "name": "知我.mp3",
        "duration": 192.28,
        "clips": [
          {
            "id": "1",
            "start": 0,
            "end": 192.28,
            "duration": 192.28
          }
        ]
      },
      {
        "id": 2,
        "label": "B",
        "name": "春颂.flac",
        "duration": 116.6,
        "clips": [
          {
            "id": "1",
            "start": 0,
            "end": 116.6,
            "duration": 116.6
          }
        ]
      }
    ]
  },
  "user_description": "把第一段分成3份，把第二段分成2份，然后把他们交替摆开"
}
```

### 响应格式

```json
{
  "explanation": "给人类看的详细说明（见下文格式要求）",
  "instructions": [
    // 给机器看的标准化指令（见下文指令类型）
  ],
  "estimated_duration": 300.88,
  "success": true,
  "validation_errors": null,
  "retry_count": 0
}
```

---

## 给人类看的：explanation 格式

### 必须包含三个部分

```
根据您的描述"[用户输入]"，我为您生成了以下拼接方案：

片段定义：
- A1a片段：《知我》00:00.00 - 01:04.00（第1份，共3份）
- B1a片段：《春颂》00:00.00 - 00:58.00（第1份，共2份）
- A1b片段：《知我》01:04.00 - 02:08.00（第2份，共3份）
- B1b片段：《春颂》00:58.00 - 01:56.60（第2份，共2份）
- A1c片段：《知我》02:08.00 - 03:12.28（第3份，共3份）

拼接顺序：
A1a + (3.0秒 淡化过渡) + B1a + (3.0秒 淡化过渡) + A1b + (3.0秒 淡化过渡) + B1b + (3.0秒 淡化过渡) + A1c

最终效果：将两段音频分别分割后交替拼接，A和B交替出现，总时长约 05:00.88
```

### 格式要求

1. **片段定义**：
   - 列出所有使用的片段
   - 格式：`轨道标签 + 片段ID`（如 A1a、B1b）
   - 包含时间范围：`mm:ss.cc - mm:ss.cc`
   - 说明片段用途（如"第1份，共3份"）

2. **拼接顺序**：
   - 使用 `+` 连接片段和过渡
   - 过渡用括号标注：`(3.0秒 淡化过渡)`
   - 清晰展示拼接逻辑

3. **最终效果**：
   - 说明总时长
   - 描述拼接效果

---

## 给机器看的：instructions 指令类型

### 1. 片段指令 (Clip Instruction)

用于指定使用哪个轨道的哪个片段，以及可选的自定义时间范围。

#### 数据模型

```python
class ClipInstruction(BaseModel):
    type: Literal["clip"] = "clip"
    trackId: str  # 轨道标识（支持数字 ID 或字符串 label）
    clipId: str   # 片段 ID
    customStart: Optional[float] = None  # 自定义开始时间（秒）
    customEnd: Optional[float] = None    # 自定义结束时间（秒）
```

#### JSON 示例

```json
{
  "type": "clip",
  "trackId": "A",
  "clipId": "1",
  "customStart": 0,
  "customEnd": 64
}
```

#### 字段说明

- **type**: 固定值 `"clip"`
- **trackId**: 
  - 可以是数字 ID（如 `1`, `2`）
  - 也可以是字符串 label（如 `"A"`, `"B"`）
  - 推荐使用 label，更直观
- **clipId**: 片段 ID（字符串，如 `"1"`, `"2"`）
- **customStart**: 可选，自定义开始时间（秒，浮点数）
- **customEnd**: 可选，自定义结束时间（秒，浮点数）

#### 使用场景

1. **完整片段**：不指定 customStart 和 customEnd
   ```json
   {"type": "clip", "trackId": "A", "clipId": "1"}
   ```

2. **部分片段**：指定 customStart 和 customEnd
   ```json
   {"type": "clip", "trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 64}
   ```

### 2. 过渡指令 (Transition Instruction)

用于指定两个片段之间的过渡类型和时长。

#### 数据模型

```python
class TransitionInstruction(BaseModel):
    type: Literal["transition"] = "transition"
    transitionType: ProcessingType  # 处理类型枚举
    duration: float  # 时长（秒），必须 > 0 且 <= 30
```

#### JSON 示例

```json
{
  "type": "transition",
  "transitionType": "crossfade",
  "duration": 3
}
```

#### 字段说明

- **type**: 固定值 `"transition"`
- **transitionType**: 过渡类型，必须是以下之一：
  - `"crossfade"`: 淡化过渡（减少总时长）
  - `"beatsync"`: 节拍过渡（减少总时长）
  - `"magicfill"`: 魔法填充（增加总时长）
  - `"silence"`: 静音填充（增加总时长）
- **duration**: 过渡时长（秒），必须 > 0 且 <= 30

#### 过渡类型说明

| 类型 | 中文名称 | 效果 | 对总时长的影响 |
|------|---------|------|---------------|
| `crossfade` | 淡化过渡 | 两段音频平滑过渡 | 减少（重叠） |
| `beatsync` | 节拍过渡 | 按节拍对齐过渡 | 减少（重叠） |
| `magicfill` | 魔法填充 | AI生成过渡音频 | 增加（插入） |
| `silence` | 静音填充 | 插入静音间隔 | 增加（插入） |

---

## 指令序列规则

### 1. 必须以片段开始

❌ 错误：
```json
[
  {"type": "transition", ...},
  {"type": "clip", ...}
]
```

✅ 正确：
```json
[
  {"type": "clip", ...},
  {"type": "transition", ...},
  {"type": "clip", ...}
]
```

### 2. 不能有连续的过渡

❌ 错误：
```json
[
  {"type": "clip", ...},
  {"type": "transition", ...},
  {"type": "transition", ...},  // ❌ 连续两个过渡
  {"type": "clip", ...}
]
```

✅ 正确：
```json
[
  {"type": "clip", ...},
  {"type": "transition", ...},
  {"type": "clip", ...},
  {"type": "transition", ...},
  {"type": "clip", ...}
]
```

### 3. 必须至少有一个片段

❌ 错误：
```json
[]  // 空指令序列
```

❌ 错误：
```json
[
  {"type": "transition", ...}  // 只有过渡，没有片段
]
```

✅ 正确：
```json
[
  {"type": "clip", ...}  // 至少一个片段
]
```

---

## 完整示例

### 场景：分段交替拼接

**用户输入：**
```
把第一段分成3份，把第二段分成2份，然后把他们交替摆开
```

**AI 响应：**

```json
{
  "explanation": "根据您的描述\"把第一段分成3份，把第二段分成2份，然后把他们交替摆开\"，我为您生成了以下拼接方案：\n\n片段定义：\n- A1a片段：《知我》00:00.00 - 01:04.00（第1份，共3份）\n- B1a片段：《春颂》00:00.00 - 00:58.00（第1份，共2份）\n- A1b片段：《知我》01:04.00 - 02:08.00（第2份，共3份）\n- B1b片段：《春颂》00:58.00 - 01:56.60（第2份，共2份）\n- A1c片段：《知我》02:08.00 - 03:12.28（第3份，共3份）\n\n拼接顺序：\nA1a + (3.0秒 淡化过渡) + B1a + (3.0秒 淡化过渡) + A1b + (3.0秒 淡化过渡) + B1b + (3.0秒 淡化过渡) + A1c\n\n最终效果：将两段音频分别分割后交替拼接，A和B交替出现，总时长约 05:00.88",
  
  "instructions": [
    {"type": "clip", "trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 64},
    {"type": "transition", "transitionType": "crossfade", "duration": 3},
    {"type": "clip", "trackId": "B", "clipId": "1", "customStart": 0, "customEnd": 58},
    {"type": "transition", "transitionType": "crossfade", "duration": 3},
    {"type": "clip", "trackId": "A", "clipId": "1", "customStart": 64, "customEnd": 128},
    {"type": "transition", "transitionType": "crossfade", "duration": 3},
    {"type": "clip", "trackId": "B", "clipId": "1", "customStart": 58, "customEnd": 116.6},
    {"type": "transition", "transitionType": "crossfade", "duration": 3},
    {"type": "clip", "trackId": "A", "clipId": "1", "customStart": 128, "customEnd": 192.28}
  ],
  
  "estimated_duration": 300.88,
  "success": true
}
```

---

## 验证机制

### 第一层：JSON 格式验证

验证响应是否为有效的 JSON 格式。

### 第二层：结构验证

使用 Pydantic 模型验证：
- 字段类型是否正确
- 必填字段是否存在
- 数值是否在合理范围内

### 第三层：语义验证

验证业务逻辑：
- trackId 是否存在于 context 中
- clipId 是否存在于对应轨道中
- 指令序列是否符合规则
- 预估时长是否合理

### 验证失败处理

- ❌ **不使用模拟响应**
- ✅ **直接抛出错误**
- ✅ **提供详细的错误信息**
- ✅ **记录完整的日志**

---

## 实现代码

### Python 数据模型

```python
from pydantic import BaseModel, Field, validator
from typing import List, Union, Literal, Optional
from enum import Enum

class ProcessingType(str, Enum):
    CROSSFADE = "crossfade"
    BEATSYNC = "beatsync"
    MAGICFILL = "magicfill"
    SILENCE = "silence"

class ClipInstruction(BaseModel):
    type: Literal["clip"] = "clip"
    trackId: str
    clipId: str
    customStart: Optional[float] = None
    customEnd: Optional[float] = None
    
    @validator('customStart', 'customEnd')
    def validate_time(cls, v):
        if v is not None and v < 0:
            raise ValueError("时间不能为负数")
        return v

class TransitionInstruction(BaseModel):
    type: Literal["transition"] = "transition"
    transitionType: ProcessingType
    duration: float = Field(..., gt=0, le=30)

class StructuredAIResponse(BaseModel):
    explanation: str
    instructions: List[Union[ClipInstruction, TransitionInstruction]] = Field(..., min_items=1)
    estimated_duration: float = Field(..., gt=0)
    
    @validator('instructions')
    def validate_instructions_sequence(cls, v):
        if not v:
            raise ValueError("指令序列不能为空")
        if v[0].type == "transition":
            raise ValueError("不能以过渡指令开始")
        for i in range(len(v) - 1):
            if v[i].type == "transition" and v[i + 1].type == "transition":
                raise ValueError("不能有连续的过渡指令")
        return v
```

### JavaScript 应用逻辑

```javascript
async function applyMuggleSpliceResult(result) {
    state.timeline = [];
    
    for (const instruction of result.instructions) {
        if (instruction.type === 'clip') {
            // 支持通过 ID 或 label 查找轨道
            const track = state.tracks.find(t => 
                t.id === instruction.trackId || 
                t.label === instruction.trackId
            );
            
            if (!track) {
                console.warn(`未找到轨道: ${instruction.trackId}`);
                continue;
            }
            
            const clip = track.clips.find(c => c.id === instruction.clipId);
            if (!clip) {
                console.warn(`未找到片段: ${instruction.trackId}${instruction.clipId}`);
                continue;
            }
            
            const timelineItem = {
                type: 'clip',
                trackId: track.id,  // 使用实际的数字 ID
                clipId: instruction.clipId
            };
            
            if (instruction.customStart !== undefined || instruction.customEnd !== undefined) {
                timelineItem.customStart = instruction.customStart ?? clip.start;
                timelineItem.customEnd = instruction.customEnd ?? clip.end;
            }
            
            state.timeline.push(timelineItem);
            
        } else if (instruction.type === 'transition') {
            state.timeline.push({
                type: 'transition',
                transitionType: instruction.transitionType || 'crossfade',
                duration: instruction.duration || 3,
                transitionId: `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            });
        }
    }
    
    renderTimeline();
    updateTotalDuration();
    await doUpdatePreview();
}
```

---

## 最佳实践

### 1. 使用 label 而不是数字 ID

✅ 推荐：
```json
{"type": "clip", "trackId": "A", "clipId": "1"}
```

❌ 不推荐：
```json
{"type": "clip", "trackId": 1, "clipId": "1"}
```

**原因：** label 更直观，提示词中也使用 label

### 2. 明确指定时间范围

当需要分割音频时，必须使用 customStart 和 customEnd：

✅ 正确：
```json
{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 64}
```

❌ 错误：
```json
{"type": "clip", "trackId": "A", "clipId": "1"}  // 这会使用完整片段
```

### 3. 合理的过渡时长

- crossfade/beatsync: 1-5 秒
- magicfill: 3-10 秒
- silence: 1-5 秒

### 4. 验证预估时长

确保 estimated_duration 与实际计算的时长接近（允许 5 秒误差）。

---

## 错误处理

### 常见错误

1. **引用了不存在的轨道ID**
   ```
   错误：引用了不存在的轨道ID: C
   原因：context 中只有 A 和 B 轨道
   解决：检查 trackId 是否正确
   ```

2. **不能以过渡指令开始**
   ```
   错误：不能以过渡指令开始
   原因：instructions 第一个元素是 transition
   解决：确保第一个指令是 clip
   ```

3. **预估时长差异过大**
   ```
   错误：预估时长 300.0s 与计算时长 250.0s 差异过大
   原因：estimated_duration 计算错误
   解决：重新计算总时长
   ```

### 错误响应格式

```json
{
  "explanation": "",
  "instructions": null,
  "success": false,
  "validation_errors": [
    "引用了不存在的轨道ID: C",
    "预估时长 300.0s 与计算时长 250.0s 差异过大"
  ],
  "retry_count": 2
}
```

---

## 总结

这套标准化接口确保了：

1. ✅ **人机分离**：explanation 给人看，instructions 给机器执行
2. ✅ **类型安全**：使用 Pydantic 进行严格的类型验证
3. ✅ **可扩展**：易于添加新的指令类型和过渡类型
4. ✅ **可验证**：多层验证机制确保指令的正确性
5. ✅ **可调试**：详细的错误信息和日志记录

**核心原则：标准化、可验证、不妥协。**

---

**文档版本：** v1.0  
**最后更新：** 2026-01-16  
**维护者：** BigEyeMix 开发团队
