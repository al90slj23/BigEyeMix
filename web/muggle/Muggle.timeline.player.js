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
        
        // 遍历所有片段，按顺序调度播放
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            
            // 跳过已经播放过的片段
            if (accumulatedTime + seg.duration < fromTime) {
                accumulatedTime += seg.duration;
                continue;
            }
            
            if (seg.type === 'clip') {
                const buffer = await this.loadAudioBuffer(seg.file_id, seg.start, seg.end);
                if (buffer) {
                    const source = this.audioContext.createBufferSource();
                    source.buffer = buffer;
                    source.connect(this.audioContext.destination);
                    
                    // 如果是从中间开始播放
                    const offset = fromTime > accumulatedTime ? fromTime - accumulatedTime : 0;
                    const duration = seg.duration - offset;
                    
                    source.start(scheduleTime, offset, duration);
                    this.currentSources.push(source);
                    
                    scheduleTime += duration;
                    accumulatedTime += seg.duration;
                    
                    console.log(`[Player] Scheduled clip ${seg.file_id} at ${scheduleTime - duration}s, duration ${duration}s`);
                }
            } else if (seg.type === 'transition') {
                const transType = seg.transition_type;
                
                // 过渡块处理
                if (transType === 'crossfade' || transType === 'beatsync') {
                    // 淡入淡出和节拍对齐：播放前后段的重叠部分
                    // 关键：这些过渡减少总时长，因为后段会提前开始
                    if (seg.transition_data && seg.transition_data.prevFileId && seg.transition_data.nextFileId) {
                        const data = seg.transition_data;
                        const overlapDuration = seg.duration;
                        
                        // 回退 scheduleTime，让后段提前开始（与前段重叠）
                        scheduleTime -= overlapDuration;
                        
                        // 播放前段的淡出部分（最后 overlapDuration 秒）
                        const prevBuffer = await this.loadAudioBuffer(
                            data.prevFileId, 
                            data.prevFadeStart, 
                            data.prevFadeEnd
                        );
                        
                        // 播放后段的淡入部分（前 overlapDuration 秒）
                        const nextBuffer = await this.loadAudioBuffer(
                            data.nextFileId, 
                            data.nextFadeStart, 
                            data.nextFadeEnd
                        );
                        
                        if (prevBuffer && nextBuffer) {
                            // 创建淡出效果
                            const prevSource = this.audioContext.createBufferSource();
                            prevSource.buffer = prevBuffer;
                            const prevGain = this.audioContext.createGain();
                            prevSource.connect(prevGain);
                            prevGain.connect(this.audioContext.destination);
                            
                            // 淡出：从 1 到 0
                            prevGain.gain.setValueAtTime(1, scheduleTime);
                            prevGain.gain.linearRampToValueAtTime(0, scheduleTime + overlapDuration);
                            
                            // 创建淡入效果
                            const nextSource = this.audioContext.createBufferSource();
                            nextSource.buffer = nextBuffer;
                            const nextGain = this.audioContext.createGain();
                            nextSource.connect(nextGain);
                            nextGain.connect(this.audioContext.destination);
                            
                            // 淡入：从 0 到 1
                            nextGain.gain.setValueAtTime(0, scheduleTime);
                            nextGain.gain.linearRampToValueAtTime(1, scheduleTime + overlapDuration);
                            
                            // 同时开始播放
                            prevSource.start(scheduleTime);
                            nextSource.start(scheduleTime);
                            
                            this.currentSources.push(prevSource, nextSource);
                            
                            console.log(`[Player] Scheduled ${transType} overlap at ${scheduleTime}s, duration ${overlapDuration}s (reduces total time)`);
                        }
                        
                        // scheduleTime 已经回退了，所以实际上减少了总时长
                        // accumulatedTime 也要减少
                        accumulatedTime -= overlapDuration;
                    } else {
                        // 没有完整数据，静音处理（不应该发生）
                        console.warn(`[Player] Incomplete ${transType} data, skipping`);
                    }
                } else if (transType === 'silence') {
                    // 静音：不播放，只增加时间
                    scheduleTime += seg.duration;
                    accumulatedTime += seg.duration;
                    console.log(`[Player] Silence ${seg.duration}s`);
                } else if (transType === 'magicfill' && seg.magic_output_id) {
                    // 魔法填充：播放生成的音频
                    const buffer = await this.loadAudioBuffer(seg.magic_output_id, 0, seg.duration);
                    if (buffer) {
                        const source = this.audioContext.createBufferSource();
                        source.buffer = buffer;
                        source.connect(this.audioContext.destination);
                        source.start(scheduleTime);
                        this.currentSources.push(source);
                        console.log(`[Player] Scheduled magic fill at ${scheduleTime}s, duration ${seg.duration}s`);
                    }
                    scheduleTime += seg.duration;
                    accumulatedTime += seg.duration;
                } else {
                    // 其他过渡类型暂时静音
                    scheduleTime += seg.duration;
                    accumulatedTime += seg.duration;
                }
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
