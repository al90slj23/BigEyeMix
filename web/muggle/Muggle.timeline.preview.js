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
                if (response.data.success && response.data.waveform) {
                    const fullWaveform = response.data.waveform;  // 这是数组
                    const fullDuration = response.data.duration;
                    const fullPeaks = fullWaveform;  // 直接使用 waveform 数组
                    
                    // 计算片段在完整波形中的采样点范围
                    const startRatio = seg.start / fullDuration;
                    const endRatio = seg.end / fullDuration;
                    const startIndex = Math.floor(startRatio * fullPeaks.length);
                    const endIndex = Math.ceil(endRatio * fullPeaks.length);
                    
                    // 提取片段波形
                    const segmentPeaks = fullPeaks.slice(startIndex, endIndex);
                    stitchedPeaks.push(...segmentPeaks);
                    totalSamples += segmentPeaks.length;
                    
                    console.log(`[Preview] Extracted ${segmentPeaks.length} peaks from ${seg.file_id} (${seg.start}s - ${seg.end}s)`);
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
            if (seg.transition_type === 'magicfill' && seg.magic_output_id) {
                // 如果魔法填充已生成，获取其波形
                try {
                    const response = await axios.get(API_BASE + `/api/uploads/${seg.magic_output_id}/waveform`);
                    if (response.data.success && response.data.waveform) {
                        const magicPeaks = response.data.waveform;  // 直接使用 waveform 数组
                        stitchedPeaks.push(...magicPeaks);
                        totalSamples += magicPeaks.length;
                        console.log(`[Preview] Added magic fill waveform: ${magicPeaks.length} peaks`);
                    } else {
                        // 占位数据
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
                // 其他过渡类型（静音、淡入淡出等）使用低幅度波形
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
    
    previewSection.style.display = 'block';
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
            
            segments.push({
                type: 'transition',
                transition_type: transType,
                duration: duration,
                magic_output_id: item.magicOutputId || null  // 如果已生成，使用缓存
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
    wavesurfer.on('ready', () => {
        isPreviewLoading = false;  // 重置加载标志
        previewLoading.style.display = 'none';
        previewWaveformEl.style.display = 'block';
        previewPlayBtn.disabled = false;
        
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
        
        // 初始化 Web Audio API 播放器
        if (!window.previewPlayer) {
            window.previewPlayer = new PreviewPlayer();
        }
        window.previewPlayer.setSegments(segments, previewTotalDuration);
        
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
    
    const previewSection = document.getElementById('previewSection');
    if (previewSection) previewSection.style.display = 'none';
    
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
