/**
 * Muggle.timeline.player.js - Web Audio API 播放器
 * BigEyeMix 麻瓜模式
 * 
 * 实现无缝拼接播放：根据时间线片段，按顺序播放各个音频文件的指定片段
 * 
 * 核心设计：
 * - 使用单一时间源：playbackStartTime（播放开始时的 AudioContext.currentTime）
 * - 当前播放时间 = AudioContext.currentTime - playbackStartTime + seekOffset
 * - 片段调度时间 = playbackStartTime + (segment.accumulatedStart - seekOffset)
 */

class PreviewPlayer {
    constructor() {
        this.audioContext = null;
        this.audioBuffers = new Map();      // 缓存已加载的音频 buffer (Map: cacheKey -> AudioBuffer)
        this.activeSources = [];            // 当前播放的 source nodes
        this.isPlaying = false;
        this.playbackStartTime = 0;         // 播放开始时的 AudioContext.currentTime（固定值）
        this.seekOffset = 0;                // seek 偏移量（从哪个时间点开始播放）
        this.segments = [];                 // 播放片段列表（来自 TimelineManager）
        this.totalDuration = 0;
        
        // 回调
        this.onProgressUpdate = null;       // (currentTime) => void
        this.onPlayStateChange = null;      // (isPlaying) => void
        this.onError = null;                // (error) => void
        
        // 日志开关
        this.debug = true;
    }
    
    // 初始化 AudioContext
    async init() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.log('[Player] AudioContext created');
        }
        
        // 处理 autoplay policy
        if (this.audioContext.state === 'suspended') {
            this.log('[Player] AudioContext suspended, resuming...');
            await this.audioContext.resume();
            this.log('[Player] AudioContext resumed');
        }
        
        return this.audioContext;
    }
    
    // 加载音频文件为 AudioBuffer
    async loadAudioBuffer(fileId, start, end) {
        const cacheKey = `${fileId}_${start}_${end}`;
        if (this.audioBuffers.has(cacheKey)) {
            this.log(`[Player] Using cached buffer: ${cacheKey}`);
            return this.audioBuffers.get(cacheKey);
        }
        
        try {
            this.log(`[Player] Loading audio: ${fileId} (${start}s - ${end}s)`);
            
            const response = await fetch(API_BASE + `/api/audio/${fileId}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // 如果需要裁剪，创建裁剪后的 buffer
            const trimmedBuffer = this.trimAudioBuffer(audioBuffer, start, end);
            
            // 缓存
            this.audioBuffers.set(cacheKey, trimmedBuffer);
            
            this.log(`[Player] Audio loaded and cached: ${cacheKey}`);
            
            return trimmedBuffer;
        } catch (error) {
            console.error(`[Player] Failed to load audio ${fileId}:`, error);
            if (this.onError) {
                this.onError(error);
            }
            return null;
        }
    }
    
    // 裁剪音频 buffer
    trimAudioBuffer(audioBuffer, start, end) {
        // 如果不需要裁剪，直接返回
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
    
    // 设置片段列表
    setSegments(segments, totalDuration) {
        this.segments = segments;
        this.totalDuration = totalDuration;
    }
    
    // 播放拼接的音频
    async play(fromTime = 0) {
        // 防止重复调用
        if (this.isPlaying) {
            this.log('[Player] Already playing, ignoring duplicate play() call');
            return;
        }
        
        await this.init();
        
        // 停止所有当前播放
        this.stopAllSources();
        
        // 记录播放开始时间（固定值，用于所有调度计算）
        this.playbackStartTime = this.audioContext.currentTime;
        this.seekOffset = fromTime;
        this.isPlaying = true;
        
        this.log(`[Player] ========================================`);
        this.log(`[Player] Starting playback from ${fromTime}s`);
        this.log(`[Player] playbackStartTime: ${this.playbackStartTime}s`);
        this.log(`[Player] Total duration: ${this.totalDuration}s`);
        this.log(`[Player] ========================================`);
        
        if (this.onPlayStateChange) {
            this.onPlayStateChange(true);
        }
        
        // 调度所有片段
        await this.scheduleSegments(fromTime);
        
        // 启动进度更新循环
        this.startProgressLoop();
        
        // 设置自动停止
        const remainingDuration = this.totalDuration - fromTime;
        setTimeout(() => {
            if (this.isPlaying) {
                this.log('[Player] Playback finished (timeout)');
                this.stop();
            }
        }, remainingDuration * 1000);
    }
    
    // 调度所有片段
    async scheduleSegments(fromTime) {
        this.log(`[Player] Scheduling ${this.segments.length} segments...`);
        
        for (let i = 0; i < this.segments.length; i++) {
            const segment = this.segments[i];
            
            // 跳过已经播放过的片段
            if (segment.accumulatedEnd <= fromTime) {
                this.log(`[Player] Skip segment ${i} (already played): ${segment.accumulatedStart}s - ${segment.accumulatedEnd}s`);
                continue;
            }
            
            // 计算调度时间和播放参数
            const delay = Math.max(0, segment.accumulatedStart - fromTime);
            const scheduleTime = this.playbackStartTime + delay;
            
            // 计算播放偏移和时长
            let offset = 0;
            let duration = segment.duration;
            
            if (segment.accumulatedStart < fromTime) {
                // 从片段中间开始播放
                offset = fromTime - segment.accumulatedStart;
                duration = segment.duration - offset;
            }
            
            // 根据类型调度
            if (segment.type === 'clip') {
                await this.scheduleClip(segment, scheduleTime, offset, duration, i);
            } else if (segment.type === 'crossfade') {
                await this.scheduleCrossfade(segment, scheduleTime, offset, duration, i);
            } else if (segment.type === 'silence') {
                this.log(`[Player] Segment ${i} (silence): ${duration}s at accumulated ${segment.accumulatedStart}s`);
            }
        }
        
        this.log(`[Player] All segments scheduled`);
    }
    
    // 调度单个音频片段
    async scheduleClip(segment, scheduleTime, offset, duration, index) {
        const buffer = await this.loadAudioBuffer(segment.fileId, segment.clipStart, segment.clipEnd);
        
        if (!buffer) {
            this.log(`[Player] Failed to load buffer for segment ${index}`);
            return;
        }
        
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start(scheduleTime, offset, duration);
        
        this.activeSources.push(source);
        
        this.log(`[Player] Segment ${index} (clip): scheduled at ${scheduleTime.toFixed(3)}s (delay: ${(scheduleTime - this.playbackStartTime).toFixed(3)}s), offset: ${offset.toFixed(3)}s, duration: ${duration.toFixed(3)}s, accumulated: ${segment.accumulatedStart.toFixed(3)}s`);
    }
    
    // 调度 crossfade
    async scheduleCrossfade(segment, scheduleTime, offset, duration, index) {
        const prevBuffer = await this.loadAudioBuffer(segment.prevFileId, segment.prevStart, segment.prevEnd);
        const nextBuffer = await this.loadAudioBuffer(segment.nextFileId, segment.nextStart, segment.nextEnd);
        
        if (!prevBuffer || !nextBuffer) {
            this.log(`[Player] Failed to load buffers for crossfade segment ${index}`);
            return;
        }
        
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
        
        this.log(`[Player] Segment ${index} (${segment.transitionType}): scheduled at ${scheduleTime.toFixed(3)}s (delay: ${(scheduleTime - this.playbackStartTime).toFixed(3)}s), duration: ${duration.toFixed(3)}s, accumulated: ${segment.accumulatedStart.toFixed(3)}s`);
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
    
    // 停止播放
    stop() {
        this.isPlaying = false;
        this.stopAllSources();
        this.stopProgressLoop();
        this.seekOffset = 0;
        
        this.log('[Player] Stopped');
        
        if (this.onPlayStateChange) {
            this.onPlayStateChange(false);
        }
    }
    
    // 暂停播放
    pause() {
        if (!this.isPlaying) return;
        
        const currentTime = this.getCurrentTime();
        this.stop();
        this.seekOffset = currentTime;
        
        this.log(`[Player] Paused at ${currentTime}s`);
    }
    
    // 恢复播放
    resume() {
        if (this.isPlaying) return;
        this.log(`[Player] Resuming from ${this.seekOffset}s`);
        this.play(this.seekOffset);
    }
    
    // 切换播放/暂停
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            if (this.seekOffset > 0) {
                this.resume();
            } else {
                this.play(0);
            }
        }
    }
    
    // 跳转到指定时间
    async seek(time) {
        this.log(`[Player] Seeking to ${time}s`);
        
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
            // 当前时间 = AudioContext.currentTime - playbackStartTime + seekOffset
            return this.audioContext.currentTime - this.playbackStartTime + this.seekOffset;
        }
        return this.seekOffset;
    }
    
    // 启动进度更新循环
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
    
    // 停止进度更新循环
    stopProgressLoop() {
        // requestAnimationFrame 会在下一帧自动停止（因为 isPlaying = false）
    }
    
    // 清理资源
    destroy() {
        this.log('[Player] Destroying...');
        this.stop();
        this.audioBuffers.clear();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
    
    // 日志输出
    log(message) {
        if (this.debug) {
            console.log(message);
        }
    }
}

// 全局播放器实例
window.previewPlayer = null;
