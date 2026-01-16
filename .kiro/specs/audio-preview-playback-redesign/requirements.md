# Requirements Document: Audio Preview & Playback System Redesign

## Introduction

重新设计麻瓜模式的音频预览和播放系统，解决当前存在的时间同步、波形显示、播放控制等核心问题。当前系统存在多个架构层面的问题，需要从底层重新设计。

## Glossary

- **Timeline**: 时间线，包含多个音频片段和过渡效果的序列
- **Segment**: 片段，可以是音频片段(clip)或过渡效果(transition)
- **Playhead**: 播放指针，显示当前播放位置的可视化标记
- **Waveform**: 波形图，音频的可视化表示
- **AudioContext**: Web Audio API 的音频上下文，管理音频处理图
- **BufferSource**: Web Audio API 的音频源节点，用于播放音频缓冲区
- **Crossfade**: 淡入淡出过渡，两段音频重叠播放并进行音量渐变
- **Preview_Player**: 预览播放器，负责播放拼接后的音频序列

## Requirements

### Requirement 1: 准确的时间线计算

**User Story:** 作为用户，我希望系统能准确计算拼接后的总时长，以便我了解最终音频的长度。

#### Acceptance Criteria

1. WHEN 系统构建时间线 THEN THE System SHALL 正确计算每个片段的累积时间位置
2. WHEN 存在 crossfade 过渡 THEN THE System SHALL 从总时长中减去重叠部分的时长
3. WHEN 存在 magicfill 或 silence 过渡 THEN THE System SHALL 将过渡时长加入总时长
4. THE System SHALL 在时间线数据结构中为每个片段存储 `accumulatedStart` 和 `accumulatedEnd` 属性
5. WHEN 时间线发生变化 THEN THE System SHALL 重新计算所有片段的累积时间

### Requirement 2: 统一的播放时间基准

**User Story:** 作为开发者，我需要一个统一的时间基准来同步所有播放相关的组件。

#### Acceptance Criteria

1. THE System SHALL 使用单一的时间源作为所有播放计算的基准
2. WHEN 播放开始 THEN THE System SHALL 记录播放开始时的 AudioContext.currentTime 作为 `playbackStartTime`
3. WHEN 计算当前播放位置 THEN THE System SHALL 使用公式 `currentTime = AudioContext.currentTime - playbackStartTime + seekOffset`
4. THE System SHALL 确保所有音频源的调度都基于同一个 `playbackStartTime`
5. WHEN 用户 seek 到新位置 THEN THE System SHALL 更新 `seekOffset` 并重新调度所有音频源

### Requirement 3: 精确的音频调度

**User Story:** 作为用户，我希望点击播放后音频能立即开始播放，不会有延迟。

#### Acceptance Criteria

1. WHEN 用户点击播放 THEN THE System SHALL 在 100ms 内开始播放第一个音频片段
2. WHEN 调度音频片段 THEN THE System SHALL 使用公式 `scheduleTime = playbackStartTime + (segment.accumulatedStart - seekPosition)`
3. WHEN 片段的 accumulatedStart 小于当前播放位置 THEN THE System SHALL 跳过该片段
4. WHEN 片段的 accumulatedStart 大于当前播放位置 THEN THE System SHALL 计算正确的延迟时间
5. THE System SHALL 确保第一个播放的片段的 scheduleTime 等于 playbackStartTime（延迟为0）

### Requirement 4: 实时进度更新

**User Story:** 作为用户，我希望看到播放进度实时更新，包括时间显示和播放指针位置。

#### Acceptance Criteria

1. WHEN 音频播放时 THEN THE System SHALL 每秒至少更新进度 30 次
2. WHEN 更新进度 THEN THE System SHALL 计算当前播放时间并触发 `onProgressUpdate` 回调
3. WHEN 进度回调触发 THEN THE System SHALL 更新时间显示、播放指针位置和片段进度条
4. THE System SHALL 使用 requestAnimationFrame 来实现流畅的进度更新
5. WHEN 播放停止或暂停 THEN THE System SHALL 停止进度更新循环

### Requirement 5: 波形图可视化

**User Story:** 作为用户，我希望看到拼接后音频的完整波形图，以便直观了解音频内容。

#### Acceptance Criteria

1. WHEN 时间线构建完成 THEN THE System SHALL 拼接所有片段的波形数据
2. WHEN 拼接波形数据 THEN THE System SHALL 从每个音频文件提取对应时间段的波形峰值
3. WHEN 存在 crossfade 过渡 THEN THE System SHALL 混合重叠部分的波形数据
4. THE System SHALL 使用 WaveSurfer.js 渲染拼接后的波形图
5. WHEN 波形图加载完成 THEN THE System SHALL 显示预览区域并启用播放按钮

### Requirement 6: 播放指针同步

**User Story:** 作为用户，我希望播放指针能准确跟随音频播放位置移动。

#### Acceptance Criteria

1. WHEN 音频播放时 THEN THE System SHALL 根据当前播放时间更新播放指针的水平位置
2. WHEN 计算播放指针位置 THEN THE System SHALL 使用公式 `position = (currentTime / totalDuration) * waveformWidth`
3. WHEN 播放指针超出可视区域 THEN THE System SHALL 自动滚动波形图容器
4. WHEN 用户点击波形图 THEN THE System SHALL 将播放指针移动到点击位置并 seek 到对应时间
5. THE System SHALL 确保播放指针位置与音频播放位置的误差小于 50ms

### Requirement 7: 片段进度显示

**User Story:** 作为用户，我希望看到每个片段的播放进度，以便了解当前播放到哪个片段。

#### Acceptance Criteria

1. WHEN 音频播放时 THEN THE System SHALL 更新当前播放片段的进度条
2. WHEN 播放位置在片段范围内 THEN THE System SHALL 计算片段内的相对进度百分比
3. WHEN 片段播放完成 THEN THE System SHALL 将进度条设置为 100% 并标记为已播放
4. WHEN 片段尚未播放 THEN THE System SHALL 将进度条设置为 0%
5. THE System SHALL 为当前播放的片段添加视觉高亮效果

### Requirement 8: 播放控制

**User Story:** 作为用户，我希望能够控制音频的播放、暂停、停止和跳转。

#### Acceptance Criteria

1. WHEN 用户点击播放按钮 THEN THE System SHALL 开始或恢复播放
2. WHEN 用户点击暂停按钮 THEN THE System SHALL 暂停播放并记录当前位置
3. WHEN 用户 seek 到新位置 THEN THE System SHALL 停止当前播放并从新位置开始
4. WHEN 播放到达末尾 THEN THE System SHALL 自动停止并重置播放位置
5. THE System SHALL 在播放状态变化时更新播放按钮图标

### Requirement 9: Crossfade 过渡处理

**User Story:** 作为用户，我希望 crossfade 过渡能够平滑地混合两段音频。

#### Acceptance Criteria

1. WHEN 播放 crossfade 过渡 THEN THE System SHALL 同时播放前后两段音频
2. WHEN 播放 crossfade THEN THE System SHALL 对前段音频应用淡出效果（音量从 1 到 0）
3. WHEN 播放 crossfade THEN THE System SHALL 对后段音频应用淡入效果（音量从 0 到 1）
4. THE System SHALL 使用 GainNode 来实现音量渐变
5. THE System SHALL 确保 crossfade 的时长与过渡配置一致

### Requirement 10: 错误处理和状态管理

**User Story:** 作为用户，我希望系统能够优雅地处理错误情况，不会崩溃或卡死。

#### Acceptance Criteria

1. WHEN 音频加载失败 THEN THE System SHALL 显示错误提示并禁用播放按钮
2. WHEN AudioContext 被浏览器挂起 THEN THE System SHALL 在用户交互后恢复
3. WHEN 播放过程中发生错误 THEN THE System SHALL 停止播放并显示错误信息
4. THE System SHALL 在组件销毁时清理所有音频资源和事件监听器
5. THE System SHALL 防止重复调用播放方法导致的状态混乱

### Requirement 11: 性能优化

**User Story:** 作为用户，我希望预览和播放功能流畅运行，不会卡顿。

#### Acceptance Criteria

1. WHEN 预加载音频 THEN THE System SHALL 显示加载进度
2. THE System SHALL 缓存已加载的音频 buffer 避免重复加载
3. THE System SHALL 使用 Web Worker 进行波形数据处理（如果可能）
4. WHEN 更新 UI THEN THE System SHALL 使用 requestAnimationFrame 避免阻塞主线程
5. THE System SHALL 在不需要时释放音频资源以节省内存

### Requirement 12: 调试和日志

**User Story:** 作为开发者，我需要详细的日志来诊断播放问题。

#### Acceptance Criteria

1. THE System SHALL 记录所有关键操作的时间戳和参数
2. WHEN 调度音频源 THEN THE System SHALL 记录调度时间、延迟和时长
3. WHEN 播放状态变化 THEN THE System SHALL 记录状态转换和原因
4. THE System SHALL 提供开关来启用/禁用详细日志
5. THE System SHALL 在控制台中使用不同颜色区分不同类型的日志

