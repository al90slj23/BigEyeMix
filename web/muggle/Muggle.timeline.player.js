/**
 * Muggle.timeline.player.js - Web Audio API 播放器
 * BigEyeMix 麻瓜模式
 * 
 * 实现无缝拼接播放：根据时间线片段，按顺序播放各个音频文件的指定片段
 */

class PreviewPlayer {
    constructor() {
        this.audioContext = null;
        this.audioBuffers = {};  // 缓存已加载的音频 buffer
        this.currentSources = [];  // 当前播放的 source nodes
        this.isPlaying = false;
        this.startTime = 0;  // 播放开始的时间戳
        this.pausedAt = 0;  // 暂停时的位置
        this.animationFrameId = null;
        this.segments = [];
        this.totalDuration = 0;
        this.onProgressUpdate = null;  // 进度更新回调
        this.onPlayStateChange = null;  // 播放状态变化回调
    }
    
    // 初始化 AudioContext
    initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.audioContext;
    }
    
    // 加载音频文件为 AudioBuffer
    async loadAudioBuffer(fileId, start, end) {
        const cacheKey = `${fileId}_${start}_${end}`;
        if (this.audioBuffers[cacheKey]) {
            return this.audioBuffers[cacheKey];
        }
        
        try {
            const response = await fetch(API_BASE + `/api/audio/${fileId}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // 如果需要裁剪，创建裁剪后的 buffer
            if (start > 0 || end < audioBuffer.duration) {
                const startSample = Math.floor(start * audioBuffer.sampleRate);
                const endSample = Math.floor(end * audioBuffer.sampleRate);
                const length = endSample - startSample;
                
                const trimmedBuffer = this.audioContext.createBuffer(
                    audioBuffer.numberOfChannels,
                    length,
                    audioBuffer.sampleRate
                );
                
                for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                    const sourceData = audioBuffer.getChannelData(channel);
                    const trimmedData = trimmedBuffer.getChannelData(channel);
                    for (let i = 0; i < length; i++) {
                        trimmedData[i] = sourceData[startSample + i];
                    }
                }
                
                this.audioBuffers[cacheKey] = trimmedBuffer;
                return trimmedBuffer;
            }
            
            this.audioBuffers[cacheKey] = audioBuffer;
            return audioBuffer;
        } catch (error) {
            console.error(`[Player] Failed to load audio ${fileId}:`, error);
            return null;
        }
    }
    
    // 设置片段列表
    setSegments(segments, totalDuration) {
        this.segments = segments;
        this.totalDuration = totalDuration;
    }
    
    // 播放拼接的音频
    async play(fromTime = 0) {
        // 防止重复调用
        if (this.isPlaying) {
            console.log('[Player] Already playing, ignoring duplicate play() call');
            return;
        }
        
        this.initAudioContext();
        
        // 停止所有当前播放
        this.stopAllSources();
        
        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime - fromTime;
        
        if (this.onPlayStateChange) {
            this.onPlayStateChange(true);
        }
        
        let scheduleTime = this.audioContext.currentTime;
        let accumulatedTime = 0;
        
        console.log(`[Player] Starting playback from ${fromTime}s, total duration: ${this.totalDuration}s`);
        
        // 预处理：构建实际的播放序列（处理重叠）
        const playbackSequence = [];
        
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            
            if (seg.type === 'clip') {
                // 检查下一个是否是 crossfade/beatsync
                const nextSeg = i + 1 < this.segments.length ? this.segments[i + 1] : null;
                
                if (nextSeg && nextSeg.type === 'transition' && 
                    (nextSeg.transition_type === 'crossfade' || nextSeg.transition_type === 'beatsync') &&
                    nextSeg.transition_data && nextSeg.transition_data.nextFileId) {
                    
                    // 当前片段后面有过渡，需要分段播放
                    const overlapDuration = nextSeg.duration;
                    const mainDuration = seg.duration - overlapDuration;
                    
                    if (mainDuration > 0) {
                        // 主要部分（不重叠）
                        playbackSequence.push({
                            type: 'clip',
                            file_id: seg.file_id,
                            start: seg.start,
                            end: seg.end - overlapDuration,
                            duration: mainDuration,
                            accumulatedStart: accumulatedTime
                        });
                        accumulatedTime += mainDuration;
                    }
                    
                    // 过渡部分（重叠）
                    const nextNextSeg = i + 2 < this.segments.length ? this.segments[i + 2] : null;
                    if (nextNextSeg && nextNextSeg.type === 'clip') {
                        playbackSequence.push({
                            type: 'crossfade',
                            prevFileId: seg.file_id,
                            prevStart: seg.end - overlapDuration,
                            prevEnd: seg.end,
                            nextFileId: nextNextSeg.file_id,
                            nextStart: nextNextSeg.start,
                            nextEnd: nextNextSeg.start + overlapDuration,
                            duration: overlapDuration,
                            accumulatedStart: accumulatedTime,
                            transitionType: nextSeg.transition_type
                        });
                        accumulatedTime += overlapDuration;
                        
                        // 跳过过渡块和下一个片段的开头（已经在过渡中处理）
                        i += 1; // 跳过过渡块
                        
                        // 处理下一个片段的剩余部分
                        const nextMainDuration = nextNextSeg.duration - overlapDuration;
                        if (nextMainDuration > 0) {
                            playbackSequence.push({
                                type: 'clip',
                                file_id: nextNextSeg.file_id,
                                start: nextNextSeg.start + overlapDuration,
                                end: nextNextSeg.end,
                                duration: nextMainDuration,
                                accumulatedStart: accumulatedTime
                            });
                            accumulatedTime += nextMainDuration;
                        }
                        i += 1; // 跳过下一个片段（已处理）
                    }
                } else {
                    // 正常播放整个片段
                    playbackSequence.push({
                        type: 'clip',
                        file_id: seg.file_id,
                        start: seg.start,
                        end: seg.end,
                        duration: seg.duration,
                        accumulatedStart: accumulatedTime
                    });
                    accumulatedTime += seg.duration;
                }
            } else if (seg.type === 'transition') {
                // 魔法填充和静音
                if (seg.transition_type === 'silence') {
                    playbackSequence.push({
                        type: 'silence',
                        duration: seg.duration,
                        accumulatedStart: accumulatedTime
                    });
                    accumulatedTime += seg.duration;
                } else if (seg.transition_type === 'magicfill' && seg.magic_output_id) {
                    playbackSequence.push({
                        type: 'clip',
                        file_id: seg.magic_output_id,
                        start: 0,
                        end: seg.duration,
                        duration: seg.duration,
                        accumulatedStart: accumulatedTime
                    });
                    accumulatedTime += seg.duration;
                }
            }
        }
        
        console.log('[Player] Playback sequence:', playbackSequence);
        
        // 执行播放序列
        for (const item of playbackSequence) {
            // 跳过已经播放过的部分
            if (item.accumulatedStart + item.duration < fromTime) {
                continue;
            }
            
            if (item.type === 'clip') {
                const buffer = await this.loadAudioBuffer(item.file_id, item.start, item.end);
                if (buffer) {
                    const source = this.audioContext.createBufferSource();
                    source.buffer = buffer;
                    source.connect(this.audioContext.destination);
                    
                    // 如果是从中间开始播放
                    const offset = fromTime > item.accumulatedStart ? fromTime - item.accumulatedStart : 0;
                    const duration = item.duration - offset;
                    
                    // 计算实际的调度时间：当前时间 + 该片段相对于播放起点的延迟
                    const delayFromStart = Math.max(0, item.accumulatedStart - fromTime);
                    const actualScheduleTime = this.audioContext.currentTime + delayFromStart;
                    
                    source.start(actualScheduleTime, offset, duration);
                    this.currentSources.push(source);
                    
                    console.log(`[Player] Scheduled clip ${item.file_id} at ${actualScheduleTime}s (delay: ${delayFromStart}s, accumulated: ${item.accumulatedStart}s), duration ${duration}s`);
                }
            } else if (item.type === 'crossfade') {
                const prevBuffer = await this.loadAudioBuffer(item.prevFileId, item.prevStart, item.prevEnd);
                const nextBuffer = await this.loadAudioBuffer(item.nextFileId, item.nextStart, item.nextEnd);
                
                if (prevBuffer && nextBuffer) {
                    // 计算实际的调度时间：当前时间 + 该过渡相对于播放起点的延迟
                    const delayFromStart = Math.max(0, item.accumulatedStart - fromTime);
                    const actualScheduleTime = this.audioContext.currentTime + delayFromStart;
                    
                    // 创建淡出效果
                    const prevSource = this.audioContext.createBufferSource();
                    prevSource.buffer = prevBuffer;
                    const prevGain = this.audioContext.createGain();
                    prevSource.connect(prevGain);
                    prevGain.connect(this.audioContext.destination);
                    
                    // 淡出：从 1 到 0
                    prevGain.gain.setValueAtTime(1, actualScheduleTime);
                    prevGain.gain.linearRampToValueAtTime(0, actualScheduleTime + item.duration);
                    
                    // 创建淡入效果
                    const nextSource = this.audioContext.createBufferSource();
                    nextSource.buffer = nextBuffer;
                    const nextGain = this.audioContext.createGain();
                    nextSource.connect(nextGain);
                    nextGain.connect(this.audioContext.destination);
                    
                    // 淡入：从 0 到 1
                    nextGain.gain.setValueAtTime(0, actualScheduleTime);
                    nextGain.gain.linearRampToValueAtTime(1, actualScheduleTime + item.duration);
                    
                    // 同时开始播放
                    prevSource.start(actualScheduleTime);
                    nextSource.start(actualScheduleTime);
                    
                    this.currentSources.push(prevSource, nextSource);
                    
                    console.log(`[Player] Scheduled ${item.transitionType} at ${actualScheduleTime}s (delay: ${delayFromStart}s, accumulated: ${item.accumulatedStart}s), duration ${item.duration}s`);
                }
            } else if (item.type === 'silence') {
                // 静音：不需要调度，只是占位
                console.log(`[Player] Silence at ${item.accumulatedStart}s, duration ${item.duration}s`);
            }
        }
        
        // 启动进度更新
        this.updateProgress();
        
        // 播放结束时的处理
        setTimeout(() => {
            if (this.isPlaying) {
                this.stop();
            }
        }, (this.totalDuration - fromTime) * 1000);
    }
    
    // 停止所有音频源
    stopAllSources() {
        this.currentSources.forEach(source => {
            try {
                source.stop();
            } catch (e) {
                // 已经停止的 source 会抛出异常，忽略
            }
        });
        this.currentSources = [];
    }
    
    // 停止播放
    stop() {
        this.isPlaying = false;
        this.stopAllSources();
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.pausedAt = 0;
        
        if (this.onPlayStateChange) {
            this.onPlayStateChange(false);
        }
    }
    
    // 暂停播放
    pause() {
        if (!this.isPlaying) return;
        this.pausedAt = this.audioContext.currentTime - this.startTime;
        this.stop();
    }
    
    // 恢复播放
    resume() {
        if (this.isPlaying) return;
        this.play(this.pausedAt);
    }
    
    // 切换播放/暂停
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            if (this.pausedAt > 0) {
                this.resume();
            } else {
                this.play(0);
            }
        }
    }
    
    // 跳转到指定时间
    seek(time) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) {
            this.pause();
        }
        this.pausedAt = time;
        if (wasPlaying) {
            this.resume();
        }
    }
    
    // 获取当前播放时间
    getCurrentTime() {
        if (!this.audioContext) return 0;
        if (this.isPlaying) {
            return this.audioContext.currentTime - this.startTime;
        }
        return this.pausedAt;
    }
    
    // 更新播放进度
    updateProgress() {
        if (!this.isPlaying) return;
        
        const currentTime = this.getCurrentTime();
        
        if (this.onProgressUpdate) {
            this.onProgressUpdate(currentTime);
        }
        
        this.animationFrameId = requestAnimationFrame(() => this.updateProgress());
    }
    
    // 清理资源
    destroy() {
        this.stop();
        this.audioBuffers = {};
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}

// 全局播放器实例
window.previewPlayer = null;
