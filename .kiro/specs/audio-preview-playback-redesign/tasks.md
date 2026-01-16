# Implementation Plan: Audio Preview & Playback System Redesign

## Overview

按照设计文档重新实现音频预览和播放系统，采用模块化架构，确保时间同步准确、播放流畅。

## Tasks

- [x] 1. 实现 TimelineManager 模块
  - 创建 `Muggle.timeline.manager.js` 文件
  - 实现时间线数据结构和计算逻辑
  - 处理 crossfade 重叠计算
  - 生成播放片段列表
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ]* 1.1 为 TimelineManager 编写单元测试
  - 测试累积时间计算
  - 测试 crossfade 重叠处理
  - 测试总时长计算
  - _Requirements: 1.1, 1.2, 1.3_

- [ ]* 1.2 编写属性测试：时间线累积时间单调递增
  - **Property 1: 时间线累积时间单调递增**
  - **Validates: Requirements 1.1, 1.2, 1.3**

- [ ]* 1.3 编写属性测试：总时长计算正确
  - **Property 2: 总时长等于所有片段时长之和**
  - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 2. 重构 AudioPlayer 类
  - 修改 `Muggle.timeline.player.js`
  - 实现统一的时间基准（playbackStartTime + seekOffset）
  - 重写音频调度逻辑
  - 实现精确的进度计算
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 2.1 编写属性测试：播放时间与 AudioContext 一致
  - **Property 3: 播放时间与 AudioContext 时间一致**
  - **Validates: Requirements 2.1, 2.2, 2.3**

- [ ]* 2.2 编写属性测试：第一个片段立即播放
  - **Property 4: 第一个片段立即播放**
  - **Validates: Requirements 3.1, 3.5**

- [ ]* 2.3 编写属性测试：片段调度时间正确
  - **Property 5: 片段调度时间正确**
  - **Validates: Requirements 3.2, 3.3, 3.4**

- [x] 3. 实现进度更新机制
  - 使用 requestAnimationFrame 实现流畅的进度更新
  - 实现 onProgressUpdate 回调
  - 确保更新频率达到 30+ FPS
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ]* 3.1 编写属性测试：进度更新频率
  - **Property 6: 进度更新频率**
  - **Validates: Requirements 4.1**

- [x] 4. 重构 PreviewRenderer 模块
  - 修改 `Muggle.timeline.preview.js`
  - 实现波形数据拼接逻辑
  - 集成 TimelineManager 和 AudioPlayer
  - 实现播放指针同步
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 4.1 编写属性测试：播放指针位置准确
  - **Property 7: 播放指针位置准确**
  - **Validates: Requirements 6.1, 6.2, 6.5**

- [ ] 5. 实现片段进度显示
  - 更新片段条的进度条
  - 实现当前播放片段高亮
  - 同步片段进度与播放位置
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]* 5.1 编写单元测试：片段进度计算
  - 测试片段内相对进度计算
  - 测试片段状态切换
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 6. 实现播放控制功能
  - 实现播放/暂停切换
  - 实现 seek 功能
  - 实现停止功能
  - 更新播放按钮状态
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ]* 6.1 编写集成测试：播放控制流程
  - 测试播放/暂停/停止流程
  - 测试 seek 功能
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 7. 优化 Crossfade 处理
  - 实现 GainNode 音量渐变
  - 确保前后段音频同步播放
  - 验证淡入淡出效果
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ]* 7.1 编写属性测试：Crossfade 音量渐变
  - **Property 8: Crossfade 音量渐变**
  - **Validates: Requirements 9.2, 9.3**

- [ ] 8. 实现错误处理
  - 处理音频加载失败
  - 处理 AudioContext 挂起
  - 处理播放错误
  - 实现资源清理
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ]* 8.1 编写单元测试：错误处理
  - 测试音频加载失败场景
  - 测试 AudioContext 恢复
  - _Requirements: 10.1, 10.2, 10.3_

- [ ] 9. 性能优化
  - 实现音频预加载进度显示
  - 实现 AudioBuffer 缓存
  - 优化 UI 更新性能
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ]* 9.1 编写性能测试
  - 测试预加载性能
  - 测试 UI 更新帧率
  - _Requirements: 11.3, 11.4_

- [ ] 10. 添加调试日志
  - 实现结构化日志系统
  - 记录关键操作和时间戳
  - 添加日志开关
  - 使用颜色区分日志类型
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 11. 集成到现有代码
  - 更新 `handleMuggleApply` 函数使用新系统
  - 保持向后兼容
  - 测试完整流程
  - _Requirements: All_

- [ ]* 11.1 编写端到端测试
  - 测试从 AI 生成到播放的完整流程
  - 测试多种拼接场景
  - _Requirements: All_

- [ ] 12. Checkpoint - 确保所有测试通过
  - 运行所有单元测试
  - 运行所有属性测试
  - 运行集成测试
  - 修复发现的问题

- [ ] 13. 文档和清理
  - 更新代码注释
  - 编写使用文档
  - 移除旧代码
  - 清理调试代码

## Notes

- 任务标记 `*` 的为可选测试任务，可以根据时间安排决定是否实施
- 每个任务都引用了具体的需求编号，确保可追溯性
- 建议按顺序执行任务，因为后续任务依赖前面的模块
- Checkpoint 任务确保在继续之前所有功能正常工作
- 属性测试使用 fast-check 或类似的 PBT 库
- 每个属性测试至少运行 100 次迭代

