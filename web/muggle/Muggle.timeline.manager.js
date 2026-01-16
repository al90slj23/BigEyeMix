/**
 * Muggle.timeline.manager.js - 时间线管理器
 * BigEyeMix 麻瓜模式
 * 
 * 负责管理时间线数据结构和时间计算
 * - 计算每个片段的累积时间位置 (accumulatedStart/End)
 * - 处理 crossfade 重叠逻辑
 * - 生成播放片段列表供播放器使用
 */

class TimelineManager {
    constructor(timeline, tracks) {
        this.timeline = timeline;           // 原始时间线数据
        this.tracks = tracks;               // 轨道数据
        this.computedTimeline = null;       // 计算后的时间线
        this.playbackSegments = null;       // 播放片段列表
        this.totalDuration = 0;             // 总时长
        
        // 日志开关
        this.debug = true;
    }
    
    /**
     * 计算时间线
     * 填充每个 item 的 accumulatedStart/End，生成 playbackSegments
     */
    compute() {
        this.log('[TimelineManager] Computing timeline...');
        
        this.computedTimeline = [];
        this.playbackSegments = [];
        
        let currentTime = 0;  // 当前累积时间
        
        for (let i = 0; i < this.timeline.length; i++) {
            const item = { ...this.timeline[i] };  // 复制 item
            
            if (item.type === 'clip') {
                const track = this.tracks.find(t => t.id === item.trackId);
                if (!track || !track.uploaded) {
                    this.log(`[TimelineManager] Skip clip ${i}: track not found or not uploaded`);
                    continue;
                }
                
                const clip = track.clips.find(c => c.id === item.clipId);
                if (!clip) {
                    this.log(`[TimelineManager] Skip clip ${i}: clip not found`);
                    continue;
                }
                
                // 获取片段的实际时间范围
                const clipStart = item.customStart !== undefined ? item.customStart : clip.start;
                const clipEnd = item.customEnd !== undefined ? item.customEnd : clip.end;
                const clipDuration = clipEnd - clipStart;
                
                // Clip 完整播放，不分段
                const computedItem = {
                    ...item,
                    accumulatedStart: currentTime,
                    accumulatedEnd: currentTime + clipDuration,
                    actualDuration: clipDuration,
                    clipStart: clipStart,
                    clipEnd: clipEnd,
                    fileId: track.uploaded.file_id
                };
                this.computedTimeline.push(computedItem);
                
                // 添加到播放片段
                this.playbackSegments.push({
                    type: 'clip',
                    fileId: track.uploaded.file_id,
                    clipStart: clipStart,
                    clipEnd: clipEnd,
                    accumulatedStart: currentTime,
                    accumulatedEnd: currentTime + clipDuration,
                    duration: clipDuration
                });
                
                currentTime += clipDuration;
                
                this.log(`[TimelineManager] Clip ${i}: ${clipDuration}s (accumulated: ${computedItem.accumulatedStart}s - ${computedItem.accumulatedEnd}s)`);
                
            } else if (item.type === 'transition') {
                const transType = item.transitionType || 'magicfill';
                const duration = item.duration;
                
                if (transType === 'crossfade' || transType === 'beatsync') {
                    // Crossfade: 淡入淡出效果，不改变总时长
                    // 实现方式：回退时间，让下一个片段与前一个片段重叠播放
                    
                    if (item.transitionData && item.transitionData.prevFileId && item.transitionData.nextFileId) {
                        // 有完整的前后信息
                        const data = item.transitionData;
                        
                        // 回退时间，创建重叠区域
                        currentTime -= duration;
                        
                        // Crossfade 标记（用于 UI 显示）
                        const computedItem = {
                            ...item,
                            accumulatedStart: currentTime,  // 重叠区域的起始时间
                            accumulatedEnd: currentTime + duration,  // 重叠区域的结束时间
                            actualDuration: duration,
                            isCrossfadeMarker: true  // 标记这是一个 crossfade 效果
                        };
                        this.computedTimeline.push(computedItem);
                        
                        this.log(`[TimelineManager] ${transType} ${i}: ${duration}s overlap at ${currentTime}s - next clip will start at ${currentTime}s (overlap with previous)`);
                        
                        // Crossfade 不添加独立的播放片段
                        // 下一个 clip 会从 currentTime 开始，与前一个 clip 的最后部分重叠
                        
                    } else {
                        // 没有完整信息，暂时不处理
                        const computedItem = {
                            ...item,
                            accumulatedStart: currentTime,
                            accumulatedEnd: currentTime,
                            actualDuration: 0,
                            isCrossfadeMarker: true,
                            incomplete: true
                        };
                        this.computedTimeline.push(computedItem);
                        
                        this.log(`[TimelineManager] ${transType} ${i} (incomplete): waiting for data`);
                    }
                    
                } else if (transType === 'magicfill') {
                    // 魔法填充：增加时长
                    const computedItem = {
                        ...item,
                        accumulatedStart: currentTime,
                        accumulatedEnd: currentTime + duration,
                        actualDuration: duration
                    };
                    this.computedTimeline.push(computedItem);
                    
                    if (item.magicOutputId) {
                        // 添加到播放片段
                        this.playbackSegments.push({
                            type: 'clip',
                            fileId: item.magicOutputId,
                            clipStart: 0,
                            clipEnd: duration,
                            accumulatedStart: currentTime,
                            accumulatedEnd: currentTime + duration,
                            duration: duration
                        });
                    }
                    
                    currentTime += duration;
                    
                    this.log(`[TimelineManager] Magic fill ${i}: ${duration}s (accumulated: ${computedItem.accumulatedStart}s - ${computedItem.accumulatedEnd}s)`);
                    
                } else if (transType === 'silence') {
                    // 静音：增加时长
                    const computedItem = {
                        ...item,
                        accumulatedStart: currentTime,
                        accumulatedEnd: currentTime + duration,
                        actualDuration: duration
                    };
                    this.computedTimeline.push(computedItem);
                    
                    // 添加到播放片段
                    this.playbackSegments.push({
                        type: 'silence',
                        accumulatedStart: currentTime,
                        accumulatedEnd: currentTime + duration,
                        duration: duration
                    });
                    
                    currentTime += duration;
                    
                    this.log(`[TimelineManager] Silence ${i}: ${duration}s (accumulated: ${computedItem.accumulatedStart}s - ${computedItem.accumulatedEnd}s)`);
                }
            }
        }
        
        this.totalDuration = currentTime;
        
        this.log(`[TimelineManager] Computation complete. Total duration: ${this.totalDuration}s`);
        this.log(`[TimelineManager] Computed timeline items: ${this.computedTimeline.length}`);
        this.log(`[TimelineManager] Playback segments: ${this.playbackSegments.length}`);
        
        return {
            computedTimeline: this.computedTimeline,
            playbackSegments: this.playbackSegments,
            totalDuration: this.totalDuration
        };
    }
    
    /**
     * 根据播放时间查找当前片段
     */
    getSegmentAtTime(time) {
        if (!this.playbackSegments) {
            return null;
        }
        
        for (const segment of this.playbackSegments) {
            if (time >= segment.accumulatedStart && time < segment.accumulatedEnd) {
                return segment;
            }
        }
        
        return null;
    }
    
    /**
     * 获取播放片段列表
     */
    getPlaybackSegments() {
        return this.playbackSegments || [];
    }
    
    /**
     * 获取计算后的时间线
     */
    getComputedTimeline() {
        return this.computedTimeline || [];
    }
    
    /**
     * 获取总时长
     */
    getTotalDuration() {
        return this.totalDuration;
    }
    
    /**
     * 日志输出
     */
    log(message) {
        if (this.debug) {
            console.log(message);
        }
    }
}

// 导出到全局
window.TimelineManager = TimelineManager;
