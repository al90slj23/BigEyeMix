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
    
    const segments = [];
    previewSegments = [];
    let currentTime = 0;

    state.timeline.forEach((item, index) => {
        if (item.type === 'clip') {
            const track = state.tracks.find(t => t.id === item.trackId);
            if (track && track.uploaded) {
                const clip = track.clips.find(c => c.id === item.clipId);
                if (clip) {
                    const duration = clip.end - clip.start;
                    segments.push({
                        file_id: track.uploaded.file_id,
                        start: clip.start,
                        end: clip.end
                    });
                    previewSegments.push({
                        index: index,
                        start: currentTime,
                        end: currentTime + duration,
                        color: track.color.bg,
                        label: track.label + clip.id
                    });
                    currentTime += duration;
                }
            }
        } else if (item.type === 'transition') {
            const transType = item.transitionType || 'magicfill';
            segments.push({
                file_id: '__transition__',
                start: 0,
                end: item.duration,
                transition_type: transType
            });
            previewSegments.push({
                index: index,
                start: currentTime,
                end: currentTime + item.duration,
                color: '#e0e0e0',
                label: item.duration + 's',
                isMagicFill: transType === 'magicfill',
                magicState: item.magicState || (transType === 'magicfill' ? 'magic-loading' : '')
            });
            currentTime += item.duration;
        }
    });
    
    previewTotalDuration = currentTime;
    
    if (segments.length === 0) {
        isPreviewLoading = false;
        hidePreview();
        return;
    }
    
    try {
        const response = await axios.post(API_BASE + '/api/mix/preview', {
            segments: segments,
            transition_type: state.selectedScene || 'cut'
        });
        
        const previewId = response.data.preview_id;
        currentPreviewId = previewId;  // 记录当前预览 ID
        const previewUrl = API_BASE + `/api/audio/${previewId}`;
        const waveformData = response.data.waveform;  // 预计算的波形数据
        
        console.log(`[Preview] Generated new preview: ${previewId}`);
        
        // 渲染预览片段条
        renderPreviewSegments();
        
        initPreviewWavesurfer(previewUrl, waveformData);
        
    } catch (error) {
        console.log('[Preview] Generation failed:', error);
        isPreviewLoading = false;
        hidePreview();
    }
}

function initPreviewWavesurfer(previewUrl, waveformData) {
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
    
    // 主波形 - 使用主题蓝紫渐变色
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
    
    // 使用预计算波形数据加速加载
    if (waveformData && waveformData.peaks && waveformData.duration) {
        console.log('[Preview] Loading with cached waveform data');
        wavesurfer.load(previewUrl, [waveformData.peaks], waveformData.duration);
    } else {
        console.log('[Preview] Loading without cache');
        wavesurfer.load(previewUrl);
    }
    state.previewWavesurfer = wavesurfer;

    // 导航条波形 - 同样使用主题色
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
        // 使用预计算波形数据
        if (waveformData && waveformData.peaks && waveformData.duration) {
            navigatorWavesurfer.load(previewUrl, [waveformData.peaks], waveformData.duration);
        } else {
            navigatorWavesurfer.load(previewUrl);
        }
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
        
        wavesurfer.setTime(seekTime);
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
    
    // 播放控制
    const updateProgress = () => {
        const currentTime = wavesurfer.getCurrentTime();
        timeDisplay.textContent = formatTime(currentTime);
        updateAllProgress(currentTime);
        const duration = wavesurfer.getDuration();
        if (duration > 0) updateRulerPosition(currentTime / duration, true);
    };
    
    wavesurfer.on('audioprocess', updateProgress);
    wavesurfer.on('seeking', () => {
        updateProgress();
        updateSeekTime(wavesurfer.getCurrentTime());
    });
    
    previewPlayBtn.onclick = () => { wavesurfer.playPause(); };
    wavesurfer.on('play', () => { 
        isPlaying = true;
        previewPlayBtn.innerHTML = '<i data-lucide="pause"></i>'; 
        refreshIcons(); 
    });
    wavesurfer.on('pause', () => { 
        isPlaying = false;
        previewPlayBtn.innerHTML = '<i data-lucide="play"></i>'; 
        refreshIcons(); 
    });
    wavesurfer.on('finish', () => { updateAllProgress(0); });
    
    // 同步导航条波形进度
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
