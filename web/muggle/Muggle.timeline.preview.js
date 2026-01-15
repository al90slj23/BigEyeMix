/**
 * Muggle.timeline.preview.js - 预览波形相关
 * BigEyeMix 麻瓜模式
 */

let previewDebounceTimer = null;
let previewSegments = [];
let previewTotalDuration = 0;
let isPreviewLoading = false;  // 防止重复加载
let currentPreviewId = null;  // 当前预览的 ID

function renderPreviewSegments() {
    const container = document.getElementById('previewSegments');
    if (!container || previewSegments.length === 0) {
        if (container) container.style.display = 'none';
        return;
    }
    
    container.style.display = 'flex';
    container.innerHTML = previewSegments.map((seg, i) => {
        const widthPercent = ((seg.end - seg.start) / previewTotalDuration) * 100;
        const magicClass = seg.magicState || '';
        return `
            <div class="preview-seg ${magicClass}" data-seg="${i}" style="width:${widthPercent}%; background:${seg.color}">
                <span class="preview-seg-label">${seg.label}</span>
                <div class="preview-seg-progress"></div>
            </div>
        `;
    }).join('');
    refreshIcons();
}

/**
 * 拼接波形数据
 * 从各个片段的完整波形中提取对应时间段，然后拼接成预览波形
 */
async function stitchWaveformData(segments) {
    const stitchedPeaks = [];
    let totalSamples = 0;
    
    for (const seg of segments) {
        if (seg.type === 'clip') {
            // 获取完整音频的波形数据
            try {
                const response = await axios.get(API_BASE + `/api/uploads/${seg.file_id}/waveform`);
                if (response.data.success && response.data.waveform && Array.isArray(response.data.waveform)) {
                    const fullPeaks = response.data.waveform;  // 直接使用 waveform 数组
                    const fullDuration = response.data.duration;
                    
                    // 检查波形数据是否有效
                    if (fullPeaks.length === 0) {
                        console.log(`[Preview] Empty waveform for ${seg.file_id}, using placeholder`);
                        const estimatedSamples = Math.ceil((seg.duration / previewTotalDuration) * 800);
                        stitchedPeaks.push(...new Array(estimatedSamples).fill(0.5));
                        totalSamples += estimatedSamples;
                    } else {
                        // 计算片段在完整波形中的采样点范围
                        const startRatio = seg.start / fullDuration;
                        const endRatio = seg.end / fullDuration;
                        const startIndex = Math.floor(startRatio * fullPeaks.length);
                        const endIndex = Math.ceil(endRatio * fullPeaks.length);
                        
                        // 提取片段波形
                        const segmentPeaks = fullPeaks.slice(startIndex, endIndex);
                        
                        if (segmentPeaks.length > 0) {
                            stitchedPeaks.push(...segmentPeaks);
                            totalSamples += segmentPeaks.length;
                            console.log(`[Preview] Extracted ${segmentPeaks.length} peaks from ${seg.file_id} (${seg.start}s - ${seg.end}s)`);
                        } else {
                            // 提取结果为空，使用占位数据
                            const estimatedSamples = Math.ceil((seg.duration / previewTotalDuration) * 800);
                            stitchedPeaks.push(...new Array(estimatedSamples).fill(0.5));
                            totalSamples += estimatedSamples;
                            console.log(`[Preview] Empty extraction for ${seg.file_id}, using placeholder`);
                        }
                    }
                } else {
                    // 没有缓存波形，使用占位数据
                    const estimatedSamples = Math.ceil((seg.duration / previewTotalDuration) * 800);
                    stitchedPeaks.push(...new Array(estimatedSamples).fill(0.5));
                    totalSamples += estimatedSamples;
                }
            } catch (error) {
                console.log(`[Preview] Failed to get waveform for ${seg.file_id}:`, error);
                // 使用占位数据
                const estimatedSamples = Math.ceil((seg.duration / previewTotalDuration) * 800);
                stitchedPeaks.push(...new Array(estimatedSamples).fill(0.5));
                totalSamples += estimatedSamples;
            }
        } else if (seg.type === 'transition') {
            // 过渡块
            if (seg.transition_type === 'crossfade' || seg.transition_type === 'beatsync') {
                // 淡入淡出和节拍对齐：使用前后段的重叠部分
                if (seg.transition_data && seg.transition_data.prevFileId && seg.transition_data.nextFileId) {
                    const data = seg.transition_data;
                    
                    try {
                        // 获取前段的淡出部分波形
                        const prevResponse = await axios.get(API_BASE + `/api/uploads/${data.prevFileId}/waveform`);
                        if (prevResponse.data.success && prevResponse.data.waveform && Array.isArray(prevResponse.data.waveform) && prevResponse.data.waveform.length > 0) {
                            const prevPeaks = prevResponse.data.waveform;
                            const prevDuration = prevResponse.data.duration;
                            
                            const fadeStartRatio = data.prevFadeStart / prevDuration;
                            const fadeEndRatio = data.prevFadeEnd / prevDuration;
                            const fadeStartIndex = Math.floor(fadeStartRatio * prevPeaks.length);
                            const fadeEndIndex = Math.ceil(fadeEndRatio * prevPeaks.length);
                            
                            const prevFadePeaks = prevPeaks.slice(fadeStartIndex, fadeEndIndex);
                            
                            // 获取后段的淡入部分波形
                            const nextResponse = await axios.get(API_BASE + `/api/uploads/${data.nextFileId}/waveform`);
                            if (nextResponse.data.success && nextResponse.data.waveform && Array.isArray(nextResponse.data.waveform) && nextResponse.data.waveform.length > 0) {
                                const nextPeaks = nextResponse.data.waveform;
                                const nextDuration = nextResponse.data.duration;
                                
                                const nextFadeStartRatio = data.nextFadeStart / nextDuration;
                                const nextFadeEndRatio = data.nextFadeEnd / nextDuration;
                                const nextFadeStartIndex = Math.floor(nextFadeStartRatio * nextPeaks.length);
                                const nextFadeEndIndex = Math.ceil(nextFadeEndRatio * nextPeaks.length);
                                
                                const nextFadePeaks = nextPeaks.slice(nextFadeStartIndex, nextFadeEndIndex);
                                
                                // 混合两段波形（简单平均）
                                const mixedLength = Math.max(prevFadePeaks.length, nextFadePeaks.length);
                                const mixedPeaks = [];
                                for (let i = 0; i < mixedLength; i++) {
                                    const prevVal = i < prevFadePeaks.length ? prevFadePeaks[i] : 0;
                                    const nextVal = i < nextFadePeaks.length ? nextFadePeaks[i] : 0;
                                    mixedPeaks.push((prevVal + nextVal) / 2);
                                }
                                
                                stitchedPeaks.push(...mixedPeaks);
                                totalSamples += mixedPeaks.length;
                                console.log(`[Preview] Added ${seg.transition_type} waveform: ${mixedPeaks.length} peaks`);
                            } else {
                                // 后段波形获取失败，使用占位
                                const estimatedSamples = Math.ceil((seg.duration / previewTotalDuration) * 800);
                                stitchedPeaks.push(...new Array(estimatedSamples).fill(0.3));
                                totalSamples += estimatedSamples;
                            }
                        } else {
                            // 前段波形获取失败，使用占位
                            const estimatedSamples = Math.ceil((seg.duration / previewTotalDuration) * 800);
                            stitchedPeaks.push(...new Array(estimatedSamples).fill(0.3));
                            totalSamples += estimatedSamples;
                        }
                    } catch (error) {
                        console.log(`[Preview] Failed to get transition waveform:`, error);
                        const estimatedSamples = Math.ceil((seg.duration / previewTotalDuration) * 800);
                        stitchedPeaks.push(...new Array(estimatedSamples).fill(0.3));
                        totalSamples += estimatedSamples;
                    }
                } else {
                    // 没有完整的过渡数据，使用占位
                    const estimatedSamples = Math.ceil((seg.duration / previewTotalDuration) * 800);
                    stitchedPeaks.push(...new Array(estimatedSamples).fill(0.3));
                    totalSamples += estimatedSamples;
                }
            } else if (seg.transition_type === 'magicfill' && seg.magic_output_id) {
                // 魔法填充：如果已生成，获取其波形
                try {
                    const response = await axios.get(API_BASE + `/api/uploads/${seg.magic_output_id}/waveform`);
                    if (response.data.success && response.data.waveform && Array.isArray(response.data.waveform) && response.data.waveform.length > 0) {
                        const magicPeaks = response.data.waveform;
                        stitchedPeaks.push(...magicPeaks);
                        totalSamples += magicPeaks.length;
                        console.log(`[Preview] Added magic fill waveform: ${magicPeaks.length} peaks`);
                    } else {
                        const estimatedSamples = Math.ceil((seg.duration / previewTotalDuration) * 800);
                        stitchedPeaks.push(...new Array(estimatedSamples).fill(0.3));
                        totalSamples += estimatedSamples;
                    }
                } catch (error) {
                    const estimatedSamples = Math.ceil((seg.duration / previewTotalDuration) * 800);
                    stitchedPeaks.push(...new Array(estimatedSamples).fill(0.3));
                    totalSamples += estimatedSamples;
                }
            } else {
                // 其他过渡类型（静音等）使用低幅度波形
                const estimatedSamples = Math.ceil((seg.duration / previewTotalDuration) * 800);
                const amplitude = seg.transition_type === 'silence' ? 0.05 : 0.3;
                stitchedPeaks.push(...new Array(estimatedSamples).fill(amplitude));
                totalSamples += estimatedSamples;
            }
        }
    }
    
    console.log(`[Preview] Stitched waveform: ${totalSamples} total samples`);
    
    // 如果没有采样点，使用占位数据
    if (stitchedPeaks.length === 0) {
        console.log('[Preview] No peaks found, using placeholder');
        stitchedPeaks = new Array(800).fill(0.5);
    }
    
    return {
        peaks: stitchedPeaks,
        duration: previewTotalDuration
    };
}

function updatePreviewWaveform() {
    if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    // 取消当前加载标志，允许新的预览请求
    isPreviewLoading = false;
    previewDebounceTimer = setTimeout(doUpdatePreview, 500);
}

async function doUpdatePreview() {
    // 防止重复加载（但允许通过 updatePreviewWaveform 重置）
    if (isPreviewLoading) {
        console.log('[Preview] Already loading, skip');
        return;
    }
    
    const previewSection = document.getElementById('previewSection');
    const previewLoadingEl = document.getElementById('previewLoading');
    const previewWaveformEl = document.getElementById('previewWaveform');
    const previewSegmentsEl = document.getElementById('previewSegments');
    const previewPlayBtn = document.getElementById('previewPlayBtn');
    
    if (!previewSection || state.timeline.length === 0) {
        hidePreview();
        return;
    }
    
    isPreviewLoading = true;
    
    const previewSectionWrapper = document.getElementById('previewSectionWrapper');
    if (previewSectionWrapper) previewSectionWrapper.style.display = 'block';
    
    previewLoadingEl.style.display = 'flex';
    previewWaveformEl.style.display = 'none';
    if (previewSegmentsEl) previewSegmentsEl.style.display = 'none';
    previewPlayBtn.disabled = true;
    
    // 安全销毁旧的 wavesurfer（延迟销毁避免 AbortError）
    const oldWavesurfer = state.previewWavesurfer;
    const oldNavigatorWavesurfer = state.previewNavigatorWavesurfer;
    state.previewWavesurfer = null;
    state.previewNavigatorWavesurfer = null;
    
    setTimeout(() => {
        try {
            if (oldWavesurfer) oldWavesurfer.destroy();
            if (oldNavigatorWavesurfer) oldNavigatorWavesurfer.destroy();
        } catch (e) {
            console.log('[Preview] Error destroying old wavesurfer:', e);
        }
    }, 100);
    
    // 构建预览片段信息
    const segments = [];
    previewSegments = [];
    let currentTime = 0;
    let totalDuration = 0;

    for (let index = 0; index < state.timeline.length; index++) {
        const item = state.timeline[index];
        
        if (item.type === 'clip') {
            const track = state.tracks.find(t => t.id === item.trackId);
            if (track && track.uploaded) {
                const clip = track.clips.find(c => c.id === item.clipId);
                if (clip) {
                    const duration = clip.end - clip.start;
                    segments.push({
                        type: 'clip',
                        file_id: track.uploaded.file_id,
                        start: clip.start,
                        end: clip.end,
                        duration: duration
                    });
                    previewSegments.push({
                        index: index,
                        start: currentTime,
                        end: currentTime + duration,
                        color: track.color.bg,
                        label: track.label + clip.id,
                        type: 'clip'
                    });
                    currentTime += duration;
                    totalDuration += duration;
                }
            }
        } else if (item.type === 'transition') {
            const transType = item.transitionType || 'magicfill';
            const duration = item.duration;
            
            // 对于淡入淡出和节拍对齐，这是重叠处理，减少总时长
            if (transType === 'crossfade' || transType === 'beatsync') {
                // 检查是否有完整的前后信息
                if (item.transitionData && item.transitionData.prevFileId && item.transitionData.nextFileId) {
                    const data = item.transitionData;
                    
                    // 过渡块的显示位置：从前段末尾回退 duration 开始
                    const transitionStart = currentTime - duration;
                    const transitionEnd = currentTime;
                    
                    segments.push({
                        type: 'transition',
                        transition_type: transType,
                        duration: duration,
                        transition_data: data
                    });
                    
                    previewSegments.push({
                        index: index,
                        start: transitionStart,
                        end: transitionEnd,
                        color: transType === 'crossfade' ? '#f59e0b' : '#ec4899',
                        label: duration + 's',
                        type: 'transition',
                        transitionType: transType
                    });
                    
                    // 减少总时长（因为是重叠的）
                    currentTime -= duration;
                    totalDuration -= duration;
                } else {
                    // 没有完整信息，标记为处理中，暂时不减少时长
                    segments.push({
                        type: 'transition',
                        transition_type: transType,
                        duration: duration,
                        transition_data: item.transitionData || {}
                    });
                    
                    previewSegments.push({
                        index: index,
                        start: currentTime,
                        end: currentTime + duration,
                        color: '#e0e0e0',
                        label: duration + 's',
                        type: 'transition',
                        transitionType: transType,
                        magicState: 'processing'
                    });
                    
                    // 暂时不改变时长（等完整信息后会重新计算）
                }
            } else {
                // 魔法填充和静音：增加时长
                segments.push({
                    type: 'transition',
                    transition_type: transType,
                    duration: duration,
                    magic_output_id: item.magicOutputId || null
                });
                
                previewSegments.push({
                    index: index,
                    start: currentTime,
                    end: currentTime + duration,
                    color: '#e0e0e0',
                    label: duration + 's',
                    type: 'transition',
                    transitionType: transType,
                    magicState: item.magicState || (transType === 'magicfill' ? 'magic-loading' : '')
                });
                currentTime += duration;
                totalDuration += duration;
            }
        }
    }
    
    previewTotalDuration = totalDuration;
    
    if (segments.length === 0) {
        isPreviewLoading = false;
        hidePreview();
        return;
    }
    
    try {
        // 前端拼接波形数据
        console.log('[Preview] Building waveform from segments...');
        const stitchedWaveform = await stitchWaveformData(segments);
        
        // 渲染预览片段条
        renderPreviewSegments();
        
        // 使用拼接的波形数据初始化预览
        initPreviewWavesurferWithStitchedData(segments, stitchedWaveform);
        
    } catch (error) {
        console.log('[Preview] Generation failed:', error);
        isPreviewLoading = false;
        hidePreview();
    }
}

/**
 * 使用拼接的波形数据初始化预览 wavesurfer
 * 使用 peaks 数据直接渲染波形，不加载实际音频
 */
function initPreviewWavesurferWithStitchedData(segments, waveformData) {
    const previewLoading = document.getElementById('previewLoading');
    const previewWaveformEl = document.getElementById('previewWaveform');
    const previewPlayBtn = document.getElementById('previewPlayBtn');
    const previewContainer = document.getElementById('previewWaveformContainer');
    const rulerEl = document.getElementById('previewRuler');
    const scrollLeftEl = document.getElementById('previewScrollLeft');
    const scrollRightEl = document.getElementById('previewScrollRight');
    const navigatorWaveEl = document.getElementById('previewNavigatorWave');
    const navigatorViewport = document.getElementById('previewNavigatorViewport');
    const navigatorCursor = document.getElementById('previewNavigatorCursor');
    const navigatorContainer = document.getElementById('previewNavigator');
    const timeDisplay = document.getElementById('previewTimeDisplay');
    const seekTimeEl = document.getElementById('previewSeekTime');
    const zoomInBtn = document.getElementById('previewZoomIn');
    const zoomOutBtn = document.getElementById('previewZoomOut');
    
    const seekIcons = ['map-pin', 'target', 'crosshair', 'navigation', 'compass', 'flag', 'bookmark', 'pin', 'locate', 'anchor'];
    
    const updateSeekTime = (time) => {
        if (!seekTimeEl) return;
        const randomIcon = seekIcons[Math.floor(Math.random() * seekIcons.length)];
        seekTimeEl.innerHTML = `<i data-lucide="${randomIcon}"></i><span>${formatTime(time)}</span>`;
        refreshIcons();
    };
    
    // 主波形 - 使用拼接的波形数据
    const wavesurfer = WaveSurfer.create({
        container: previewWaveformEl,
        waveColor: '#a78bfa',
        progressColor: '#667eea',
        cursorColor: 'transparent',
        height: 60,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: true,
        interact: false,
        fillParent: true,
        minPxPerSec: 1
    });
    
    // 创建一个空的音频 URL（用于 wavesurfer，但实际不播放）
    const dummyUrl = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    
    // 使用拼接的波形数据
    console.log(`[Preview] Loading stitched waveform: ${waveformData.peaks.length} peaks, ${waveformData.duration}s`);
    wavesurfer.load(dummyUrl, [waveformData.peaks], waveformData.duration);
    state.previewWavesurfer = wavesurfer;

    // 导航条波形
    let navigatorWavesurfer = null;
    if (navigatorWaveEl) {
        navigatorWavesurfer = WaveSurfer.create({
            container: navigatorWaveEl,
            waveColor: '#a78bfa',
            progressColor: '#667eea',
            cursorColor: 'transparent',
            height: 24,
            barWidth: 1,
            barGap: 0,
            barRadius: 0,
            normalize: true,
            interact: false
        });
        navigatorWavesurfer.load(dummyUrl, [waveformData.peaks], waveformData.duration);
        state.previewNavigatorWavesurfer = navigatorWavesurfer;
    }
    
    // 状态变量
    let rulerDragging = false;
    let isPlaying = false;
    let currentZoom = 1;
    let baseZoom = 1;
    let isAutoScrolling = false;
    const minZoomMultiplier = 1;
    const maxZoomMultiplier = 50;
    
    // 预加载所有音频片段
    let allAudioLoaded = false;
    let isPreloading = false;  // 防止重复预加载
    
    const preloadAllAudio = async () => {
        if (isPreloading || allAudioLoaded) {
            console.log('[Preview] Preload already in progress or completed');
            return;
        }
        
        isPreloading = true;
        console.log('[Preview] Preloading all audio segments...');
        
        try {
            // 初始化 AudioContext
            window.previewPlayer.initAudioContext();
            
            for (const seg of segments) {
                if (seg.type === 'clip') {
                    console.log(`[Preview] Preloading ${seg.file_id}...`);
                    await window.previewPlayer.loadAudioBuffer(seg.file_id, seg.start, seg.end);
                }
            }
            allAudioLoaded = true;
            isPreloading = false;
            console.log('[Preview] All audio segments preloaded successfully');
            
            return true;
        } catch (error) {
            console.error('[Preview] Failed to preload audio:', error);
            allAudioLoaded = false;
            isPreloading = false;
            return false;
        }
    };
    
    // 更新标尺位置
    const updateRulerPosition = (progress, autoScroll = false) => {
        if (!rulerEl) return;
        const scrollContainer = wavesurfer?.renderer?.scrollContainer;
        if (!scrollContainer) return;
        
        const scrollWidth = scrollContainer.scrollWidth;
        const containerWidth = scrollContainer.clientWidth;
        const scrollLeft = scrollContainer.scrollLeft;
        const absoluteX = progress * scrollWidth;
        let visibleX = absoluteX - scrollLeft;
        
        const minX = -12;
        const maxX = containerWidth + 12;
        visibleX = Math.max(minX, Math.min(maxX, visibleX));
        rulerEl.style.left = visibleX + 'px';
        
        if (autoScroll && isPlaying && currentZoom > 1 && !isAutoScrolling) {
            const centerX = containerWidth / 2;
            const threshold = containerWidth * 0.6;
            if (visibleX > threshold && scrollLeft < scrollWidth - containerWidth) {
                isAutoScrolling = true;
                const newScrollLeft = absoluteX - centerX;
                scrollContainer.scrollLeft = Math.min(newScrollLeft, scrollWidth - containerWidth);
                const newVisibleX = absoluteX - scrollContainer.scrollLeft;
                rulerEl.style.left = newVisibleX + 'px';
                setTimeout(() => { isAutoScrolling = false; }, 50);
            }
        }
        updateNavigatorCursor(progress);
    };

    // 点击/拖拽标尺定位
    const seekFromRuler = (clientX) => {
        const scrollContainer = wavesurfer?.renderer?.scrollContainer;
        if (!scrollContainer) return;
        
        const rect = scrollContainer.getBoundingClientRect();
        const scrollLeft = scrollContainer.scrollLeft;
        const waveformWidth = scrollContainer.scrollWidth;
        const x = clientX - rect.left + scrollLeft;
        const progress = Math.max(0, Math.min(1, x / waveformWidth));
        const duration = wavesurfer.getDuration();
        const seekTime = duration * progress;
        
        // 使用播放器 seek
        if (window.previewPlayer) {
            window.previewPlayer.seek(seekTime);
        }
        
        updateRulerPosition(progress);
        timeDisplay.textContent = formatTime(seekTime);
        updateSeekTime(seekTime);
        updateAllProgress(seekTime);
    };
    
    previewContainer.addEventListener('click', (e) => {
        if (rulerDragging) return;
        seekFromRuler(e.clientX);
    });
    
    if (rulerEl) {
        const rulerHandles = rulerEl.querySelectorAll('.ruler-handle');
        rulerHandles.forEach(handle => {
            handle.addEventListener('touchstart', (e) => {
                e.stopPropagation(); e.preventDefault();
                rulerDragging = true;
                rulerEl.classList.add('dragging');
            });
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation(); e.preventDefault();
                rulerDragging = true;
                rulerEl.classList.add('dragging');
            });
        });
        
        document.addEventListener('touchmove', (e) => {
            if (rulerDragging && e.touches.length === 1) {
                e.preventDefault();
                seekFromRuler(e.touches[0].clientX);
            }
        }, { passive: false });
        document.addEventListener('touchend', () => {
            if (rulerDragging) { rulerDragging = false; rulerEl.classList.remove('dragging'); }
        });
        document.addEventListener('mousemove', (e) => {
            if (rulerDragging) seekFromRuler(e.clientX);
        });
        document.addEventListener('mouseup', () => {
            if (rulerDragging) { rulerDragging = false; rulerEl.classList.remove('dragging'); }
        });
    }

    // 滚动边缘指示器
    const updateScrollEdges = () => {
        if (!scrollLeftEl || !scrollRightEl) return;
        const scrollContainer = wavesurfer?.renderer?.scrollContainer;
        if (!scrollContainer) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
        scrollLeftEl.classList.toggle('show', scrollLeft > 5);
        scrollRightEl.classList.toggle('show', scrollLeft < scrollWidth - clientWidth - 5);
    };
    
    // 更新导航条视口
    const updateViewport = () => {
        if (!navigatorViewport) return;
        const scrollContainer = wavesurfer?.renderer?.scrollContainer;
        if (!scrollContainer) return;
        const scrollWidth = scrollContainer.scrollWidth;
        const containerWidth = scrollContainer.clientWidth;
        const scrollLeft = scrollContainer.scrollLeft;
        const viewportWidthPercent = (containerWidth / scrollWidth) * 100;
        const viewportLeftPercent = (scrollLeft / scrollWidth) * 100;
        navigatorViewport.style.width = viewportWidthPercent + '%';
        navigatorViewport.style.left = viewportLeftPercent + '%';
        navigatorViewport.style.display = 'block';
    };
    
    // 更新导航条播放位置
    const updateNavigatorCursor = (progress) => {
        if (!navigatorCursor) return;
        navigatorCursor.style.left = Math.max(0, Math.min(100, progress * 100)) + '%';
    };
    
    // 滚动事件
    const onScroll = () => {
        if (isAutoScrolling) return;
        updateScrollEdges();
        updateViewport();
        const duration = wavesurfer.getDuration();
        if (duration > 0) {
            const progress = wavesurfer.getCurrentTime() / duration;
            updateRulerPosition(progress, false);
        }
    };
    wavesurfer.on('scroll', onScroll);
    wavesurfer.on('zoom', () => {
        setTimeout(() => {
            updateScrollEdges();
            updateViewport();
            const duration = wavesurfer.getDuration();
            if (duration > 0) {
                const progress = wavesurfer.getCurrentTime() / duration;
                updateRulerPosition(progress);
            }
        }, 50);
    });

    // 缩放
    const applyZoom = (newMultiplier) => {
        currentZoom = Math.max(minZoomMultiplier, Math.min(maxZoomMultiplier, newMultiplier));
        wavesurfer.zoom(baseZoom * currentZoom);
    };
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => applyZoom(currentZoom * 1.5));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => applyZoom(currentZoom / 1.5));
    const zoomResetBtn = document.getElementById('previewZoomReset');
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => applyZoom(1));
    
    // 双指缩放
    let initialPinchDistance = 0, initialZoom = 1;
    const getDistance = (touches) => {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };
    previewContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            initialPinchDistance = getDistance(e.touches);
            initialZoom = currentZoom;
        }
    }, { passive: false });
    previewContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const scale = getDistance(e.touches) / initialPinchDistance;
            applyZoom(initialZoom * scale);
        }
    }, { passive: false });
    
    // 导航条拖拽
    let navigatorDragging = false;
    const navigateFromNavigator = (clientX) => {
        if (!navigatorContainer) return;
        const scrollContainer = wavesurfer?.renderer?.scrollContainer;
        if (!scrollContainer) return;
        const rect = navigatorContainer.getBoundingClientRect();
        const x = clientX - rect.left;
        const progress = Math.max(0, Math.min(1, x / rect.width));
        const scrollWidth = scrollContainer.scrollWidth;
        const containerWidth = scrollContainer.clientWidth;
        const targetScroll = (progress * scrollWidth) - (containerWidth / 2);
        scrollContainer.scrollLeft = Math.max(0, Math.min(scrollWidth - containerWidth, targetScroll));
    };
    
    if (navigatorContainer) {
        navigatorContainer.addEventListener('touchstart', (e) => {
            e.preventDefault(); navigatorDragging = true;
            navigateFromNavigator(e.touches[0].clientX);
        }, { passive: false });
        navigatorContainer.addEventListener('touchmove', (e) => {
            if (navigatorDragging) { e.preventDefault(); navigateFromNavigator(e.touches[0].clientX); }
        }, { passive: false });
        navigatorContainer.addEventListener('touchend', () => { navigatorDragging = false; });
        navigatorContainer.addEventListener('mousedown', (e) => {
            navigatorDragging = true; navigateFromNavigator(e.clientX);
        });
        document.addEventListener('mousemove', (e) => {
            if (navigatorDragging) navigateFromNavigator(e.clientX);
        });
        document.addEventListener('mouseup', () => { navigatorDragging = false; });
    }

    // wavesurfer ready
    wavesurfer.on('ready', async () => {
        // 波形数据准备好了，但还不显示，先检查所有块是否都处理完
        console.log('[Preview] Waveform ready, checking if all blocks are processed...');
        
        // 检查是否所有片段都已准备好（没有 loading 状态的过渡块）
        const hasLoadingTransition = previewSegments.some(seg => 
            seg.type === 'transition' && 
            (seg.magicState === 'magic-loading' || seg.magicState === 'processing')
        );
        
        if (hasLoadingTransition) {
            console.log('[Preview] Some transitions are still processing, keeping loading state');
            // 保持 loading 状态，不显示波形
            return;
        }
        
        // 所有块都处理完了，开始预加载音频
        console.log('[Preview] All blocks processed, preloading audio...');
        
        // 初始化 Web Audio API 播放器
        if (!window.previewPlayer) {
            window.previewPlayer = new PreviewPlayer();
        }
        window.previewPlayer.setSegments(segments, previewTotalDuration);
        
        // 预加载所有音频
        const preloadSuccess = await preloadAllAudio();
        
        if (!preloadSuccess) {
            console.error('[Preview] Audio preload failed');
            previewLoading.innerHTML = '<div class="waveform-error">音频加载失败</div>';
            return;
        }
        
        // 音频加载完成后才显示波形和启用播放
        isPreviewLoading = false;
        previewLoading.style.display = 'none';
        previewWaveformEl.style.display = 'block';
        previewPlayBtn.disabled = false;
        
        console.log('[Preview] Preview ready to play');
        
        // 显示片段条
        const previewSegmentsEl = document.getElementById('previewSegments');
        if (previewSegmentsEl && previewSegments.length > 0) {
            previewSegmentsEl.style.display = 'flex';
        }
        
        previewTotalDuration = wavesurfer.getDuration();
        document.getElementById('previewDuration').textContent = formatTime(previewTotalDuration);
        
        // 计算 baseZoom
        const containerWidth = previewContainer.clientWidth - 20;
        if (previewTotalDuration > 0 && containerWidth > 0) {
            baseZoom = containerWidth / previewTotalDuration;
            wavesurfer.zoom(baseZoom);
        }
        
        initTimelineProgress();
        
        // 设置播放器回调
        window.previewPlayer.onProgressUpdate = (currentTime) => {
            timeDisplay.textContent = formatTime(currentTime);
            updateAllProgress(currentTime);
            const progress = currentTime / previewTotalDuration;
            updateRulerPosition(progress, true);
            
            if (navigatorWavesurfer && navigatorWavesurfer.getDuration() > 0) {
                navigatorWavesurfer.setTime(currentTime);
            }
        };
        
        window.previewPlayer.onPlayStateChange = (playing) => {
            isPlaying = playing;
            previewPlayBtn.innerHTML = playing ? '<i data-lucide="pause"></i>' : '<i data-lucide="play"></i>';
            refreshIcons();
        };
        
        // 延迟初始化标尺和视口，等待 zoom 完成
        setTimeout(() => {
            updateRulerPosition(0);
            updateScrollEdges();
            updateViewport();
            refreshIcons();
        }, 100);
    });
    
    wavesurfer.on('error', (err) => {
        isPreviewLoading = false;  // 重置加载标志
        console.log('[Preview] Wavesurfer error:', err);
        previewLoading.innerHTML = '<div class="waveform-error">预览加载失败</div>';
    });
    
    // 播放控制 - 使用 Web Audio API 播放器
    previewPlayBtn.onclick = () => { 
        if (window.previewPlayer) {
            window.previewPlayer.togglePlayPause();
        }
    };
    
    // 同步导航条波形进度（仅用于显示，不用于播放）
    if (navigatorWavesurfer) {
        wavesurfer.on('audioprocess', () => {
            const time = wavesurfer.getCurrentTime();
            if (navigatorWavesurfer.getDuration() > 0) navigatorWavesurfer.setTime(time);
        });
        wavesurfer.on('seeking', () => {
            const time = wavesurfer.getCurrentTime();
            if (navigatorWavesurfer.getDuration() > 0) navigatorWavesurfer.setTime(time);
        });
    }
}

function initTimelineProgress() {
    document.querySelectorAll('.timeline-item').forEach((item) => {
        if (!item.querySelector('.item-progress')) {
            const progressEl = document.createElement('div');
            progressEl.className = 'item-progress';
            item.insertBefore(progressEl, item.firstChild);
        }
    });
}

function updateAllProgress(currentTime) {
    previewSegments.forEach((seg, i) => {
        const segEl = document.querySelector(`.preview-seg[data-seg="${i}"] .preview-seg-progress`);
        if (!segEl) return;
        
        if (currentTime >= seg.end) {
            segEl.style.width = '100%';
        } else if (currentTime > seg.start) {
            const segProgress = (currentTime - seg.start) / (seg.end - seg.start);
            segEl.style.width = (segProgress * 100) + '%';
        } else {
            segEl.style.width = '0%';
        }
    });
    
    previewSegments.forEach((seg) => {
        const itemEl = document.querySelector(`.timeline-item[data-index="${seg.index}"]`);
        if (!itemEl) return;
        const progressEl = itemEl.querySelector('.item-progress');
        if (!progressEl) return;
        
        if (currentTime >= seg.end) {
            progressEl.style.width = '100%';
            itemEl.classList.add('played');
            itemEl.classList.remove('playing');
        } else if (currentTime > seg.start) {
            const segProgress = (currentTime - seg.start) / (seg.end - seg.start);
            progressEl.style.width = (segProgress * 100) + '%';
            itemEl.classList.add('playing');
            itemEl.classList.remove('played');
        } else {
            progressEl.style.width = '0%';
            itemEl.classList.remove('played', 'playing');
        }
    });
}

function hidePreview() {
    isPreviewLoading = false;  // 重置加载标志
    
    const previewSectionWrapper = document.getElementById('previewSectionWrapper');
    if (previewSectionWrapper) previewSectionWrapper.style.display = 'none';
    
    try {
        if (state.previewWavesurfer) {
            state.previewWavesurfer.destroy();
            state.previewWavesurfer = null;
        }
        if (state.previewNavigatorWavesurfer) {
            state.previewNavigatorWavesurfer.destroy();
            state.previewNavigatorWavesurfer = null;
        }
    } catch (e) {
        console.log('[Preview] Error in hidePreview:', e);
    }
    
    previewSegments = [];
    previewTotalDuration = 0;
    
    document.querySelectorAll('.timeline-item').forEach(item => {
        item.classList.remove('played', 'playing');
        const progressEl = item.querySelector('.item-progress');
        if (progressEl) progressEl.style.width = '0%';
    });
}
