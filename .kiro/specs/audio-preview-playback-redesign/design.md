# Design Document: Audio Preview & Playback System Redesign

## Overview

本设计文档描述了如何重新架构麻瓜模式的音频预览和播放系统。核心思想是：

1. **单一时间源**：使用 AudioContext.currentTime 作为唯一的时间基准
2. **预计算时间线**：在播放前计算好所有片段的累积时间位置
3. **精确调度**：基于预计算的时间线精确调度所有音频源
4. **分离关注点**：将时间线计算、音频播放、UI 更新分离为独立模块

## Architecture

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Muggle Splice UI                        │
│  (用户输入 → AI 生成指令 → 应用到时间线)                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Timeline Manager                          │
│  - 管理 timeline 数据结构                                    │
│  - 计算累积时间 (accumulatedStart/End)                       │
│  - 处理 crossfade 重叠逻辑                                   │
│  - 提供时间线查询接口                                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Preview Renderer                           │
│  - 拼接波形数据                                              │
│  - 渲染 WaveSurfer 波形图                                    │
│  - 渲染片段条 (segment bars)                                 │
│  - 管理播放指针 (playhead)                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Audio Player                              │
│  - 管理 AudioContext                                         │
│  - 预加载音频 buffer                                         │
│  - 调度音频源 (BufferSource)                                 │
│  - 处理 crossfade (GainNode)                                │
│  - 管理播放状态                                              │
│  - 提供进度回调                                              │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Timeline Manager

负责管理时间线数据结构和时间计算。

#### 数据结构

```javascript
// Timeline Item (时间线项)
{
  type: 'clip' | 'transition',
  
  // Clip 特有字段
  trackId: number,
  clipId: number,
  customStart: number,  // 可选，自定义起始时间
  customEnd: number,    // 可选，自定义结束时间
  
  // Transition 特有字段
  transitionType: 'crossfade' | 'beatsync' | 'magicfill' | 'silence',
  duration: number,
  transitionData: object,  // 过渡相关数据
  magicOutputId: string,   // 魔法填充生成的音频 ID
  
  // 计算字段（由 Timeline Manager 填充）
  accumulatedStart: number,  // 在拼接后音频中的起始时间
  accumulatedEnd: number,    // 在拼接后音频中的结束时间
  actualDuration: number     // 实际播放时长
}

// Playback Segment (播放片段，用于音频播放器)
{
  type: 'clip' | 'crossfade' | 'silence',
  
  // Clip 类型
  fileId: string,
  clipStart: number,    // 在原音频文件中的起始时间
  clipEnd: number,      // 在原音频文件中的结束时间
  
  // Crossfade 类型
  prevFileId: string,
  prevStart: number,
  prevEnd: number,
  nextFileId: string,
  nextStart: number,
  nextEnd: number,
  
  // 通用字段
  accumulatedStart: number,  // 在拼接后音频中的起始时间
  accumulatedEnd: number,    // 在拼接后音频中的结束时间
  duration: number           // 片段时长
}
```

#### 接口

```javascript
class TimelineManager {
  constructor(timeline, tracks) {
    this.timeline = timeline;  // 原始时间线数据
    this.tracks = tracks;      // 轨道数据
    this.computedTimeline = null;  // 计算后的时间线
    this.playbackSegments = null;  // 播放片段列表
    this.totalDuration = 0;
  }
  
  // 计算时间线（填充 accumulatedStart/End）
  compute() {
    // 1. 遍历 timeline，计算每个 item 的累积时间
    // 2. 处理 crossfade 的重叠逻辑
    // 3. 生成 playbackSegments 供播放器使用
    // 4. 计算总时长
  }
  
  // 根据播放时间查找当前片段
  getSegmentAtTime(time) {
    // 返回包含该时间点的 segment
  }
  
  // 获取播放片段列表
  getPlaybackSegments() {
    return this.playbackSegments;
  }
  
  // 获取总时长
  getTotalDuration() {
    return this.totalDuration;
  }
}
```

### 2. Audio Player

负责音频播放的核心逻辑。

#### 接口

```javascript
class AudioPlayer {
  constructor() {
    this.audioContext = null;
    this.audioBuffers = new Map();  // fileId -> AudioBuffer
    this.activeSources = [];        // 当前播放的 source nodes
    this.isPlaying = false;
    this.playbackStartTime = 0;     // 播放开始时的 AudioContext.currentTime
    this.seekOffset = 0;            // seek 偏移量
    this.segments = [];             // 播放片段列表
    this.totalDuration = 0;
    
    // 回调
    this.onProgressUpdate = null;   // (currentTime) => void
    this.onPlayStateChange = null;  // (isPlaying) => void
    this.onError = null;            // (error) => void
  }
  
  // 初始化 AudioContext
  async init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    // 处理 autoplay policy
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }
  
  // 设置播放片段
  setSegments(segments, totalDuration) {
    this.segments = segments;
    this.totalDuration = totalDuration;
  }
  
  // 预加载音频
  async preloadAudio(fileId, start, end) {
    const cacheKey = `${fileId}_${start}_${end}`;
    if (this.audioBuffers.has(cacheKey)) {
      return this.audioBuffers.get(cacheKey);
    }
    
    // 1. 获取音频文件
    const response = await fetch(`/api/audio/${fileId}`);
    const arrayBuffer = await response.arrayBuffer();
    
    // 2. 解码音频
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    
    // 3. 裁剪音频（如果需要）
    const trimmedBuffer = this.trimAudioBuffer(audioBuffer, start, end);
    
    // 4. 缓存
    this.audioBuffers.set(cacheKey, trimmedBuffer);
    
    return trimmedBuffer;
  }
  
  // 裁剪音频 buffer
  trimAudioBuffer(audioBuffer, start, end) {
    if (start === 0 && end >= audioBuffer.duration) {
      return audioBuffer;
    }
    
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.floor(end * sampleRate);
    const length = endSample - startSample;
    
    const trimmedBuffer = this.audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      length,
      sampleRate
    );
    
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const trimmedData = trimmedBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        trimmedData[i] = sourceData[startSample + i];
      }
    }
    
    return trimmedBuffer;
  }
  
  // 播放
  async play(fromTime = 0) {
    if (this.isPlaying) {
      console.warn('[AudioPlayer] Already playing');
      return;
    }
    
    await this.init();
    
    // 停止所有当前播放
    this.stopAllSources();
    
    // 记录播放开始时间
    this.playbackStartTime = this.audioContext.currentTime;
    this.seekOffset = fromTime;
    this.isPlaying = true;
    
    if (this.onPlayStateChange) {
      this.onPlayStateChange(true);
    }
    
    // 调度所有片段
    await this.scheduleSegments(fromTime);
    
    // 启动进度更新
    this.startProgressLoop();
    
    // 设置自动停止
    const remainingDuration = this.totalDuration - fromTime;
    setTimeout(() => {
      if (this.isPlaying) {
        this.stop();
      }
    }, remainingDuration * 1000);
  }
  
  // 调度片段
  async scheduleSegments(fromTime) {
    for (const segment of this.segments) {
      // 跳过已经播放过的片段
      if (segment.accumulatedEnd <= fromTime) {
        continue;
      }
      
      // 计算调度时间
      const delay = Math.max(0, segment.accumulatedStart - fromTime);
      const scheduleTime = this.playbackStartTime + delay;
      
      // 计算播放偏移和时长
      let offset = 0;
      let duration = segment.duration;
      
      if (segment.accumulatedStart < fromTime) {
        offset = fromTime - segment.accumulatedStart;
        duration = segment.duration - offset;
      }
      
      // 根据类型调度
      if (segment.type === 'clip') {
        await this.scheduleClip(segment, scheduleTime, offset, duration);
      } else if (segment.type === 'crossfade') {
        await this.scheduleCrossfade(segment, scheduleTime, offset, duration);
      } else if (segment.type === 'silence') {
        // 静音不需要调度
        console.log(`[AudioPlayer] Silence at ${segment.accumulatedStart}s, duration ${duration}s`);
      }
    }
  }
  
  // 调度单个音频片段
  async scheduleClip(segment, scheduleTime, offset, duration) {
    const buffer = await this.preloadAudio(segment.fileId, segment.clipStart, segment.clipEnd);
    
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.start(scheduleTime, offset, duration);
    
    this.activeSources.push(source);
    
    console.log(`[AudioPlayer] Scheduled clip ${segment.fileId} at ${scheduleTime}s (delay: ${scheduleTime - this.playbackStartTime}s), offset: ${offset}s, duration: ${duration}s`);
  }
  
  // 调度 crossfade
  async scheduleCrossfade(segment, scheduleTime, offset, duration) {
    const prevBuffer = await this.preloadAudio(segment.prevFileId, segment.prevStart, segment.prevEnd);
    const nextBuffer = await this.preloadAudio(segment.nextFileId, segment.nextStart, segment.nextEnd);
    
    // 前段淡出
    const prevSource = this.audioContext.createBufferSource();
    prevSource.buffer = prevBuffer;
    const prevGain = this.audioContext.createGain();
    prevSource.connect(prevGain);
    prevGain.connect(this.audioContext.destination);
    
    prevGain.gain.setValueAtTime(1, scheduleTime);
    prevGain.gain.linearRampToValueAtTime(0, scheduleTime + duration);
    
    prevSource.start(scheduleTime, offset, duration);
    this.activeSources.push(prevSource);
    
    // 后段淡入
    const nextSource = this.audioContext.createBufferSource();
    nextSource.buffer = nextBuffer;
    const nextGain = this.audioContext.createGain();
    nextSource.connect(nextGain);
    nextGain.connect(this.audioContext.destination);
    
    nextGain.gain.setValueAtTime(0, scheduleTime);
    nextGain.gain.linearRampToValueAtTime(1, scheduleTime + duration);
    
    nextSource.start(scheduleTime, offset, duration);
    this.activeSources.push(nextSource);
    
    console.log(`[AudioPlayer] Scheduled crossfade at ${scheduleTime}s (delay: ${scheduleTime - this.playbackStartTime}s), duration: ${duration}s`);
  }
  
  // 停止所有音频源
  stopAllSources() {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch (e) {
        // 已经停止的 source 会抛出异常，忽略
      }
    }
    this.activeSources = [];
  }
  
  // 暂停
  pause() {
    if (!this.isPlaying) return;
    
    const currentTime = this.getCurrentTime();
    this.stop();
    this.seekOffset = currentTime;
  }
  
  // 停止
  stop() {
    this.isPlaying = false;
    this.stopAllSources();
    this.stopProgressLoop();
    
    if (this.onPlayStateChange) {
      this.onPlayStateChange(false);
    }
  }
  
  // Seek
  async seek(time) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.stop();
    }
    this.seekOffset = time;
    if (wasPlaying) {
      await this.play(time);
    }
  }
  
  // 获取当前播放时间
  getCurrentTime() {
    if (!this.audioContext) return 0;
    if (this.isPlaying) {
      return this.audioContext.currentTime - this.playbackStartTime + this.seekOffset;
    }
    return this.seekOffset;
  }
  
  // 进度更新循环
  startProgressLoop() {
    const update = () => {
      if (!this.isPlaying) return;
      
      const currentTime = this.getCurrentTime();
      
      if (this.onProgressUpdate) {
        this.onProgressUpdate(currentTime);
      }
      
      requestAnimationFrame(update);
    };
    
    requestAnimationFrame(update);
  }
  
  // 停止进度循环
  stopProgressLoop() {
    // requestAnimationFrame 会在下一帧自动停止（因为 isPlaying = false）
  }
  
  // 清理资源
  destroy() {
    this.stop();
    this.audioBuffers.clear();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
```

### 3. Preview Renderer

负责渲染波形图和 UI 更新。

#### 接口

```javascript
class PreviewRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.wavesurfer = null;
    this.timelineManager = null;
    this.audioPlayer = null;
    this.playhead = null;
  }
  
  // 初始化
  async init(timelineManager, audioPlayer) {
    this.timelineManager = timelineManager;
    this.audioPlayer = audioPlayer;
    
    // 设置播放器回调
    this.audioPlayer.onProgressUpdate = (time) => this.updateProgress(time);
    this.audioPlayer.onPlayStateChange = (playing) => this.updatePlayButton(playing);
    
    // 拼接波形数据
    const waveformData = await this.stitchWaveformData();
    
    // 初始化 WaveSurfer
    this.initWaveSurfer(waveformData);
    
    // 渲染片段条
    this.renderSegmentBars();
    
    // 初始化播放指针
    this.initPlayhead();
  }
  
  // 拼接波形数据
  async stitchWaveformData() {
    const segments = this.timelineManager.getPlaybackSegments();
    const peaks = [];
    
    for (const segment of segments) {
      if (segment.type === 'clip') {
        // 获取波形数据
        const response = await fetch(`/api/uploads/${segment.fileId}/waveform`);
        const data = await response.json();
        
        // 提取对应时间段的峰值
        const segmentPeaks = this.extractPeaks(
          data.waveform,
          data.duration,
          segment.clipStart,
          segment.clipEnd
        );
        
        peaks.push(...segmentPeaks);
      } else if (segment.type === 'crossfade') {
        // 混合前后段的波形
        const prevPeaks = await this.getPeaks(segment.prevFileId, segment.prevStart, segment.prevEnd);
        const nextPeaks = await this.getPeaks(segment.nextFileId, segment.nextStart, segment.nextEnd);
        const mixedPeaks = this.mixPeaks(prevPeaks, nextPeaks);
        peaks.push(...mixedPeaks);
      } else {
        // 静音或其他
        const silencePeaks = new Array(100).fill(0.05);
        peaks.push(...silencePeaks);
      }
    }
    
    return {
      peaks,
      duration: this.timelineManager.getTotalDuration()
    };
  }
  
  // 提取峰值
  extractPeaks(fullPeaks, fullDuration, start, end) {
    const startRatio = start / fullDuration;
    const endRatio = end / fullDuration;
    const startIndex = Math.floor(startRatio * fullPeaks.length);
    const endIndex = Math.ceil(endRatio * fullPeaks.length);
    return fullPeaks.slice(startIndex, endIndex);
  }
  
  // 混合峰值
  mixPeaks(peaks1, peaks2) {
    const maxLength = Math.max(peaks1.length, peaks2.length);
    const mixed = [];
    for (let i = 0; i < maxLength; i++) {
      const p1 = i < peaks1.length ? peaks1[i] : 0;
      const p2 = i < peaks2.length ? peaks2[i] : 0;
      mixed.push((p1 + p2) / 2);
    }
    return mixed;
  }
  
  // 初始化 WaveSurfer
  initWaveSurfer(waveformData) {
    this.wavesurfer = WaveSurfer.create({
      container: this.container.querySelector('.waveform'),
      waveColor: '#a78bfa',
      progressColor: '#667eea',
      cursorColor: 'transparent',
      height: 60,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: false
    });
    
    // 加载波形数据
    const dummyUrl = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    this.wavesurfer.load(dummyUrl, [waveformData.peaks], waveformData.duration);
    
    // 点击波形图 seek
    this.container.querySelector('.waveform').addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = x / rect.width;
      const time = progress * waveformData.duration;
      this.audioPlayer.seek(time);
    });
  }
  
  // 渲染片段条
  renderSegmentBars() {
    const container = this.container.querySelector('.segment-bars');
    const segments = this.timelineManager.computedTimeline;
    const totalDuration = this.timelineManager.getTotalDuration();
    
    container.innerHTML = segments.map((seg, i) => {
      const widthPercent = (seg.actualDuration / totalDuration) * 100;
      const color = seg.type === 'clip' ? this.getTrackColor(seg.trackId) : '#e0e0e0';
      return `
        <div class="segment-bar" data-index="${i}" style="width: ${widthPercent}%; background: ${color}">
          <span class="segment-label">${this.getSegmentLabel(seg)}</span>
          <div class="segment-progress"></div>
        </div>
      `;
    }).join('');
  }
  
  // 初始化播放指针
  initPlayhead() {
    this.playhead = this.container.querySelector('.playhead');
    this.updatePlayheadPosition(0);
  }
  
  // 更新进度
  updateProgress(currentTime) {
    // 更新时间显示
    this.container.querySelector('.time-display').textContent = this.formatTime(currentTime);
    
    // 更新播放指针
    const progress = currentTime / this.timelineManager.getTotalDuration();
    this.updatePlayheadPosition(progress);
    
    // 更新片段进度
    this.updateSegmentProgress(currentTime);
  }
  
  // 更新播放指针位置
  updatePlayheadPosition(progress) {
    const waveformWidth = this.container.querySelector('.waveform').offsetWidth;
    const x = progress * waveformWidth;
    this.playhead.style.left = `${x}px`;
  }
  
  // 更新片段进度
  updateSegmentProgress(currentTime) {
    const segments = this.timelineManager.computedTimeline;
    segments.forEach((seg, i) => {
      const bar = this.container.querySelector(`.segment-bar[data-index="${i}"]`);
      const progressBar = bar.querySelector('.segment-progress');
      
      if (currentTime >= seg.accumulatedEnd) {
        progressBar.style.width = '100%';
        bar.classList.add('played');
      } else if (currentTime > seg.accumulatedStart) {
        const segProgress = (currentTime - seg.accumulatedStart) / seg.actualDuration;
        progressBar.style.width = `${segProgress * 100}%`;
        bar.classList.add('playing');
      } else {
        progressBar.style.width = '0%';
        bar.classList.remove('played', 'playing');
      }
    });
  }
  
  // 更新播放按钮
  updatePlayButton(playing) {
    const btn = this.container.querySelector('.play-button');
    btn.innerHTML = playing ? '<i data-lucide="pause"></i>' : '<i data-lucide="play"></i>';
    refreshIcons();
  }
  
  // 格式化时间
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${ms}`;
  }
}
```

## Data Models

### Timeline Data Flow

```
原始 Timeline (state.timeline)
  ↓
TimelineManager.compute()
  ↓
计算后的 Timeline (computedTimeline)
  - 每个 item 有 accumulatedStart/End
  ↓
生成 Playback Segments (playbackSegments)
  - 处理 crossfade 重叠
  - 合并相邻片段
  ↓
AudioPlayer.setSegments()
  ↓
播放
```

## Correctness Properties

*属性是一个特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的正式陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### Property 1: 时间线累积时间单调递增

*For any* 计算后的时间线，每个片段的 `accumulatedStart` 应该大于等于前一个片段的 `accumulatedEnd`（对于非重叠片段）或等于前一个片段的 `accumulatedStart + (duration - overlap)`（对于 crossfade）

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: 总时长等于所有片段时长之和（考虑重叠）

*For any* 时间线，计算的总时长应该等于所有片段的实际播放时长之和

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 3: 播放时间与 AudioContext 时间一致

*For any* 播放状态，`getCurrentTime()` 应该等于 `AudioContext.currentTime - playbackStartTime + seekOffset`，误差小于 10ms

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 4: 第一个片段立即播放

*For any* 从时间 0 开始的播放，第一个音频源的调度时间应该等于 `playbackStartTime`（延迟为 0）

**Validates: Requirements 3.1, 3.5**

### Property 5: 片段调度时间正确

*For any* 播放片段，其调度时间应该等于 `playbackStartTime + (segment.accumulatedStart - seekPosition)`

**Validates: Requirements 3.2, 3.3, 3.4**

### Property 6: 进度更新频率

*For any* 播放状态，进度回调应该每秒至少被调用 30 次

**Validates: Requirements 4.1**

### Property 7: 播放指针位置准确

*For any* 播放时间，播放指针的位置应该等于 `(currentTime / totalDuration) * waveformWidth`，误差小于 2 像素

**Validates: Requirements 6.1, 6.2, 6.5**

### Property 8: Crossfade 音量渐变

*For any* crossfade 过渡，前段音频的音量应该从 1 线性降到 0，后段音频的音量应该从 0 线性升到 1

**Validates: Requirements 9.2, 9.3**

## Error Handling

1. **音频加载失败**：显示错误提示，禁用播放按钮
2. **AudioContext 挂起**：在用户交互后自动恢复
3. **播放错误**：捕获异常，停止播放，显示错误信息
4. **资源清理**：组件销毁时清理所有音频资源

## Testing Strategy

### Unit Tests

- 测试 TimelineManager 的时间计算逻辑
- 测试 AudioPlayer 的调度计算
- 测试波形数据拼接逻辑

### Property-Based Tests

- 使用 fast-check 库进行属性测试
- 每个属性至少运行 100 次迭代
- 生成随机的时间线配置进行测试

### Integration Tests

- 测试完整的播放流程
- 测试 seek 功能
- 测试暂停/恢复功能

## Performance Considerations

1. **音频预加载**：在显示预览前预加载所有音频
2. **Buffer 缓存**：缓存已加载的 AudioBuffer
3. **requestAnimationFrame**：使用 RAF 进行 UI 更新
4. **Web Worker**：考虑使用 Worker 处理波形数据（未来优化）

## Migration Plan

1. **Phase 1**: 实现新的 TimelineManager 和 AudioPlayer
2. **Phase 2**: 实现新的 PreviewRenderer
3. **Phase 3**: 集成到现有代码，保持向后兼容
4. **Phase 4**: 移除旧代码，完全切换到新系统
5. **Phase 5**: 性能优化和错误处理完善

