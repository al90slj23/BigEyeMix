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
                
                // 检查下一个是否是 crossfade/beatsync
                const nextItem = i + 1 < this.timeline.length ? this.timeline[i + 1] : null;
                const isCrossfadeNext = nextItem && 
                                       nextItem.type === 'transition' && 
                                       (nextItem.transitionType === 'crossfade' || nextItem.transitionType === 'beatsync') &&
                                       nextItem.transitionData &&
                                       nextItem.transitionData.nextFileId;
                
                if (isCrossfadeNext) {
                    // 当前片段后面有 crossfade，需要分段处理
                    const overlapDuration = nextItem.duration;
                    const mainDuration = clipDuration - overlapDuration;
                    
                    if (mainDuration > 0) {
                        // 主要部分（不重叠）
                        const mainItem = {
                            ...item,
                            accumulatedStart: currentTime,
                            accumulatedEnd: currentTime + mainDuration,
                            actualDuration: mainDuration,
                            clipStart: clipStart,
                            clipEnd: clipEnd - overlapDuration,
                            fileId: track.uploaded.file_id
                        };
                        this.computedTimeline.push(mainItem);
                        
                        // 添加到播放片段
                        this.playbackSegments.push({
                            type: 'clip',
                            fileId: track.uploaded.file_id,
                            clipStart: clipStart,
                            clipEnd: clipEnd - overlapDuration,
                            accumulatedStart: currentTime,
                            accumulatedEnd: currentTime + mainDuration,
                            duration: mainDuration
                        });
                        
                        currentTime += mainDuration;
                        
                        this.log(`[TimelineManager] Clip ${i} main part: ${mainDuration}s (accumulated: ${mainItem.accumulatedStart}s - ${mainItem.accumulatedEnd}s)`);
                    }
                    
                    // 处理 crossfade（在下一次循环中处理）
                    // 这里只是标记，实际处理在 transition 分支
                    
                } else {
                    // 正常片段，没有后续 crossfade
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
                }
                
            } else if (item.type === 'transition') {
                const transType = item.transitionType || 'magicfill';
                const duration = item.duration;
                
                if (transType === 'crossfade' || transType === 'beatsync') {
                    // Crossfade: 重叠播放，减少总时长
                    if (item.transitionData && item.transitionData.prevFileId && item.transitionData.nextFileId) {
                        // 有完整的前后信息
                        const data = item.transitionData;
                        
                        // Crossfade 的累积时间：从当前时间开始（与前段重叠）
                        const computedItem = {
                            ...item,
                            accumulatedStart: currentTime,
                            accumulatedEnd: currentTime + duration,
                            actualDuration: duration
                        };
                        this.computedTimeline.push(computedItem);
                        
                        // 添加到播放片段
                        this.playbackSegments.push({
                            type: 'crossfade',
                            prevFileId: data.prevFileId,
                            prevStart: data.prevFadeStart,
                            prevEnd: data.prevFadeEnd,
                            nextFileId: data.nextFileId,
                            nextStart: data.nextFadeStart,
                            nextEnd: data.nextFadeEnd,
                            accumulatedStart: currentTime,
                            accumulatedEnd: currentTime + duration,
                            duration: duration,
                            transitionType: transType
                        });
                        
                        currentTime += duration;
                        
                        this.log(`[TimelineManager] ${transType} ${i}: ${duration}s (accumulated: ${computedItem.accumulatedStart}s - ${computedItem.accumulatedEnd}s)`);
                        
                        // 处理下一个片段的剩余部分
                        const nextItem = i + 1 < this.timeline.length ? this.timeline[i + 1] : null;
                        if (nextItem && nextItem.type === 'clip') {
                            const nextTrack = this.tracks.find(t => t.id === nextItem.trackId);
                            if (nextTrack && nextTrack.uploaded) {
                                const nextClip = nextTrack.clips.find(c => c.id === nextItem.clipId);
                                if (nextClip) {
                                    const nextClipStart = nextItem.customStart !== undefined ? nextItem.customStart : nextClip.start;
                                    const nextClipEnd = nextItem.customEnd !== undefined ? nextItem.customEnd : nextClip.end;
                                    const nextClipDuration = nextClipEnd - nextClipStart;
                                    const nextMainDuration = nextClipDuration - duration;
                                    
                                    if (nextMainDuration > 0) {
                                        // 下一个片段的剩余部分
                                        const nextComputedItem = {
                                            ...nextItem,
                                            accumulatedStart: currentTime,
                                            accumulatedEnd: currentTime + nextMainDuration,
                                            actualDuration: nextMainDuration,
                                            clipStart: nextClipStart + duration,
                                            clipEnd: nextClipEnd,
                                            fileId: nextTrack.uploaded.file_id
                                        };
                                        this.computedTimeline.push(nextComputedItem);
                                        
                                        // 添加到播放片段
                                        this.playbackSegments.push({
                                            type: 'clip',
                                            fileId: nextTrack.uploaded.file_id,
                                            clipStart: nextClipStart + duration,
                                            clipEnd: nextClipEnd,
                                            accumulatedStart: currentTime,
                                            accumulatedEnd: currentTime + nextMainDuration,
                                            duration: nextMainDuration
                                        });
                                        
                                        currentTime += nextMainDuration;
                                        
                                        this.log(`[TimelineManager] Clip ${i + 1} remaining part: ${nextMainDuration}s (accumulated: ${nextComputedItem.accumulatedStart}s - ${nextComputedItem.accumulatedEnd}s)`);
                                    }
                                    
                                    // 跳过下一个片段（已处理）
                                    i += 1;
                                }
                            }
                        }
                    } else {
                        // 没有完整信息，标记为处理中
                        const computedItem = {
                            ...item,
                            accumulatedStart: currentTime,
                            accumulatedEnd: currentTime + duration,
                            actualDuration: duration
                        };
                        this.computedTimeline.push(computedItem);
                        
                        this.log(`[TimelineManager] ${transType} ${i} (incomplete): ${duration}s (accumulated: ${computedItem.accumulatedStart}s - ${computedItem.accumulatedEnd}s)`);
                        
                        // 暂时不改变时长（等完整信息后会重新计算）
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
