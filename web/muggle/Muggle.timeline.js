/**
 * Muggle.timeline.js - 时间线拖拽组合
 * BigEyeMix 麻瓜模式
 * 支持 PC 拖拽 + 移动端触摸拖拽（优化版）
 */

let draggedData = null;
let draggedIndex = null;
let touchClone = null;
let lastInsertIndex = -1;

function renderClipBlocks() {
    const container = document.getElementById('clipBlocks');
    if (!container) return;
    
    const blocks = [];
    state.tracks.filter(t => t.uploaded).forEach(track => {
        track.clips.forEach(clip => {
            blocks.push(`
                <div class="block clip-block" draggable="true" 
                     data-type="clip" data-track-id="${track.id}" data-clip-id="${clip.id}"
                     style="background:${track.color.bg}">
                    ${track.label}${clip.id}
                </div>
            `);
        });
    });
    
    container.innerHTML = blocks.join('');
    initDragAndDrop();
}

function renderTimeline() {
    const container = document.getElementById('timelineItems');
    const placeholder = document.getElementById('timelinePlaceholder');
    if (!container) return;
    
    if (state.timeline.length === 0) {
        placeholder.style.display = 'flex';
        container.innerHTML = '';
        hidePreview();
    } else {
        placeholder.style.display = 'none';
        container.innerHTML = state.timeline.map((item, index) => {
            if (item.type === 'clip') {
                const track = state.tracks.find(t => t.id === item.trackId);
                if (!track) return '';
                return `
                    <div class="timeline-item clip-item" data-index="${index}" style="background:${track.color.bg}">
                        <span class="item-label">${track.label}${item.clipId}</span>
                        <button class="item-remove" onclick="event.stopPropagation(); removeTimelineItem(${index})">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                `;
            } else if (item.type === 'gap') {
                const gapType = item.gapType || 'ai_fill';
                const gapInfo = gapTypes[gapType] || gapTypes.ai_fill;
                return `
                    <div class="timeline-item gap-item gap-${gapType}" data-index="${index}" style="border-left: 3px solid ${gapInfo.color}">
                        <span class="item-label"><i data-lucide="${gapInfo.icon}"></i> ${item.duration}s</span>
                        <button class="item-remove" onclick="event.stopPropagation(); removeTimelineItem(${index})">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                `;
            }
            return '';
        }).join('');
        
        updatePreviewWaveform();
    }
    
    refreshIcons();
    updateTotalDuration();
    updateNextButton();
    initDragAndDrop();
}

function initDragAndDrop() {
    // 片段块和间隔块
    document.querySelectorAll('.block[draggable="true"]').forEach(block => {
        block.ondragstart = handleDragStart;
        block.ondragend = handleDragEnd;
        block.ontouchstart = handleTouchStart;
        block.ontouchmove = handleTouchMove;
        block.ontouchend = handleTouchEnd;
    });
    
    // Drop zone
    const dropZone = document.getElementById('timelineDrop');
    if (dropZone) {
        dropZone.ondragover = handleDragOver;
        dropZone.ondrop = handleDrop;
        dropZone.ondragleave = handleDragLeave;
    }
    
    // 时间线项目
    document.querySelectorAll('.timeline-item').forEach(item => {
        item.draggable = true;
        item.ondragstart = handleTimelineItemDragStart;
        item.ondragend = handleDragEnd;
        item.ondragover = handleTimelineItemDragOver;
        item.ondrop = handleTimelineItemDrop;
        item.ontouchstart = handleTimelineTouchStart;
        item.ontouchmove = handleTouchMove;
        item.ontouchend = handleTouchEnd;
    });
}

// ==================== 数据提取 ====================

function extractDragData(el) {
    const type = el.dataset.type;
    if (type === 'clip') {
        return { type: 'clip', trackId: parseInt(el.dataset.trackId), clipId: parseInt(el.dataset.clipId) };
    } else if (type === 'gap') {
        return { 
            type: 'gap', 
            duration: parseFloat(el.dataset.duration),
            gapType: el.dataset.gapType || 'ai_fill'
        };
    }
    return null;
}

// ==================== PC 拖拽 ====================

function handleDragStart(e) {
    const el = e.target.closest('.block');
    if (!el) return;
    draggedData = extractDragData(el);
    draggedIndex = null;
    el.classList.add('dragging');
}

function handleTimelineItemDragStart(e) {
    const el = e.target.closest('.timeline-item');
    if (!el) return;
    draggedIndex = parseInt(el.dataset.index);
    draggedData = { ...state.timeline[draggedIndex] };
    el.classList.add('dragging');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    clearDropIndicators();
    draggedData = null;
    draggedIndex = null;
}

function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('timelineDrop')?.classList.add('drag-over');
}

function handleDragLeave(e) {
    document.getElementById('timelineDrop')?.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    clearDropIndicators();
    if (!draggedData) return;
    
    if (draggedIndex !== null) state.timeline.splice(draggedIndex, 1);
    state.timeline.push({ ...draggedData });
    renderTimeline();
    draggedData = null;
    draggedIndex = null;
}

function handleTimelineItemDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    updateDropIndicator(e.currentTarget, e.clientX);
}

function handleTimelineItemDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const targetIndex = parseInt(e.currentTarget.dataset.index);
    const rect = e.currentTarget.getBoundingClientRect();
    const insertBefore = e.clientX < rect.left + rect.width / 2;
    
    clearDropIndicators();
    insertAtPosition(targetIndex, insertBefore);
}

// ==================== 移动端触摸 ====================

function handleTouchStart(e) {
    const el = e.target.closest('.block');
    if (!el || el.classList.contains('gap-add-btn')) return;
    
    e.preventDefault();
    draggedData = extractDragData(el);
    draggedIndex = null;
    lastInsertIndex = -1;
    
    createClone(el, e.touches[0]);
    el.classList.add('dragging');
}

function handleTimelineTouchStart(e) {
    const el = e.target.closest('.timeline-item');
    if (!el || e.target.closest('.item-remove')) return;
    
    e.preventDefault();
    draggedIndex = parseInt(el.dataset.index);
    draggedData = { ...state.timeline[draggedIndex] };
    lastInsertIndex = -1;
    
    createClone(el, e.touches[0]);
    el.classList.add('dragging');
}

function createClone(el, touch) {
    touchClone = el.cloneNode(true);
    touchClone.style.cssText = `
        position:fixed; z-index:9999; pointer-events:none;
        opacity:0.9; transform:scale(1.1); transition:none;
        box-shadow:0 8px 24px rgba(102,126,234,0.4);
        left:${touch.clientX - el.offsetWidth/2}px;
        top:${touch.clientY - el.offsetHeight/2}px;
    `;
    document.body.appendChild(touchClone);
}

function handleTouchMove(e) {
    if (!draggedData || !touchClone) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    
    // 直接设置位置，不用 transform
    touchClone.style.left = (touch.clientX - touchClone.offsetWidth/2) + 'px';
    touchClone.style.top = (touch.clientY - touchClone.offsetHeight/2) + 'px';
    
    // 检测插入位置
    updateInsertIndicator(touch.clientX, touch.clientY);
}

function handleTouchEnd(e) {
    if (!draggedData) return;
    
    const touch = e.changedTouches[0];
    const insertPos = findInsertPosition(touch.clientX, touch.clientY);
    
    // 清理
    if (touchClone) { touchClone.remove(); touchClone = null; }
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    clearDropIndicators();
    
    // 执行插入
    if (insertPos !== null) {
        if (insertPos.index !== undefined) {
            insertAtPosition(insertPos.index, insertPos.before);
        } else {
            // 添加到末尾
            if (draggedIndex !== null) state.timeline.splice(draggedIndex, 1);
            state.timeline.push({ ...draggedData });
            renderTimeline();
        }
    }
    
    draggedData = null;
    draggedIndex = null;
    lastInsertIndex = -1;
}

// ==================== 插入位置检测 ====================

function findInsertPosition(x, y) {
    const dropZone = document.getElementById('timelineDrop');
    const dropRect = dropZone?.getBoundingClientRect();
    
    if (!dropRect || x < dropRect.left || x > dropRect.right || 
        y < dropRect.top || y > dropRect.bottom) {
        return null;
    }
    
    const items = document.querySelectorAll('.timeline-item');
    for (let i = 0; i < items.length; i++) {
        const rect = items[i].getBoundingClientRect();
        // 扩大检测范围，包括间隙
        const left = i === 0 ? dropRect.left : rect.left - 4;
        const right = i === items.length - 1 ? dropRect.right : rect.right + 4;
        
        if (x >= left && x <= right && y >= rect.top - 10 && y <= rect.bottom + 10) {
            const midX = rect.left + rect.width / 2;
            return { index: i, before: x < midX };
        }
    }
    
    return { append: true }; // 添加到末尾
}

function updateInsertIndicator(x, y) {
    const pos = findInsertPosition(x, y);
    const dropZone = document.getElementById('timelineDrop');
    
    clearDropIndicators();
    
    if (!pos) return;
    
    dropZone?.classList.add('drag-over');
    
    if (pos.index !== undefined) {
        const items = document.querySelectorAll('.timeline-item');
        const item = items[pos.index];
        if (item) {
            item.classList.add(pos.before ? 'drop-before' : 'drop-after');
        }
    }
}

function updateDropIndicator(target, clientX) {
    clearDropIndicators();
    document.getElementById('timelineDrop')?.classList.add('drag-over');
    
    const rect = target.getBoundingClientRect();
    target.classList.add(clientX < rect.left + rect.width/2 ? 'drop-before' : 'drop-after');
}

function clearDropIndicators() {
    document.getElementById('timelineDrop')?.classList.remove('drag-over');
    document.querySelectorAll('.timeline-item').forEach(item => {
        item.classList.remove('drop-before', 'drop-after');
    });
}

function insertAtPosition(targetIndex, insertBefore) {
    if (!draggedData) return;
    
    if (draggedIndex !== null) {
        const item = state.timeline.splice(draggedIndex, 1)[0];
        let newIndex = targetIndex;
        if (draggedIndex < targetIndex) newIndex--;
        if (!insertBefore) newIndex++;
        state.timeline.splice(newIndex, 0, item);
    } else {
        const insertIndex = insertBefore ? targetIndex : targetIndex + 1;
        state.timeline.splice(insertIndex, 0, { ...draggedData });
    }
    
    renderTimeline();
    draggedData = null;
    draggedIndex = null;
}

// ==================== 其他功能 ====================

window.removeTimelineItem = function(index) {
    state.timeline.splice(index, 1);
    renderTimeline();
};

window.clearTimeline = function() {
    state.timeline = [];
    renderTimeline();
};

function updateTotalDuration() {
    let total = 0;
    state.timeline.forEach(item => {
        if (item.type === 'clip') {
            const track = state.tracks.find(t => t.id === item.trackId);
            if (track) {
                const clip = track.clips.find(c => c.id === item.clipId);
                if (clip) total += clip.end - clip.start;
            }
        } else if (item.type === 'gap') {
            total += item.duration;
        }
    });
    
    document.getElementById('totalDuration').textContent = formatTime(total);
}

// ==================== 自定义间隔 ====================

let customGaps = [];
let selectedGapType = 'ai_fill'; // 默认 AI 填充

window.showCustomGapModal = function() {
    document.getElementById('customGapModal').classList.add('show');
    document.getElementById('customGapInput').focus();
    refreshIcons();
};

window.closeCustomGapModal = function() {
    document.getElementById('customGapModal').classList.remove('show');
};

window.addCustomGap = function() {
    const input = document.getElementById('customGapInput');
    const duration = parseInt(input.value);
    const gapType = getSelectedGapType();
    
    if (isNaN(duration) || duration < 1 || duration > 30) {
        alert('请输入 1 ~ 30 秒之间的数值');
        return;
    }
    
    // 直接添加到时间线
    state.timeline.push({ type: 'gap', duration: duration, gapType: gapType });
    renderTimeline();
    
    closeCustomGapModal();
};

function renderGapBlocks() {
    const container = document.getElementById('gapBlocks');
    if (!container) return;
    
    const allGaps = [...gapPresets, ...customGaps].sort((a, b) => a - b);
    
    // 预设间隔块默认使用 AI 填充
    container.innerHTML = allGaps.map(sec => `
        <div class="block gap-block" draggable="true" data-type="gap" data-duration="${sec}" data-gap-type="ai_fill">
            <i data-lucide="sparkles"></i> ${sec}s
        </div>
    `).join('') + `
        <div class="block gap-add-btn" onclick="showCustomGapModal()">
            <i data-lucide="plus"></i>
        </div>
    `;
    
    refreshIcons();
    initDragAndDrop();
}


// ==================== 预览波形 ====================

let previewDebounceTimer = null;
let previewSegments = []; // 保存段信息用于颜色显示
let previewTotalDuration = 0;

function updatePreviewWaveform() {
    // 防抖，避免频繁请求
    if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(doUpdatePreview, 500);
}

async function doUpdatePreview() {
    const previewSection = document.getElementById('previewSection');
    const previewLoading = document.getElementById('previewLoading');
    const previewWaveform = document.getElementById('previewWaveform');
    const previewPlayBtn = document.getElementById('previewPlayBtn');
    
    if (!previewSection || state.timeline.length === 0) {
        hidePreview();
        return;
    }
    
    // 显示预览区域
    previewSection.style.display = 'block';
    previewLoading.style.display = 'flex';
    previewWaveform.style.display = 'none';
    previewPlayBtn.disabled = true;
    
    // 销毁旧的 wavesurfer
    if (state.previewWavesurfer) {
        state.previewWavesurfer.destroy();
        state.previewWavesurfer = null;
    }
    
    // 构建预览请求和段信息
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
        } else if (item.type === 'gap') {
            segments.push({
                file_id: '__gap__',
                start: 0,
                end: item.duration
            });
            previewSegments.push({
                index: index,
                start: currentTime,
                end: currentTime + item.duration,
                color: '#e0e0e0',
                label: item.duration + 's'
            });
            currentTime += item.duration;
        }
    });
    
    previewTotalDuration = currentTime;
    
    if (segments.length === 0) {
        hidePreview();
        return;
    }
    
    try {
        // 请求预览混音
        const response = await axios.post(API_BASE + '/api/mix/preview', {
            segments: segments,
            transition_type: state.selectedScene || 'cut'
        });
        
        const previewUrl = API_BASE + `/api/audio/${response.data.preview_id}`;
        
        // 创建预览波形容器
        previewWaveform.innerHTML = '<div class="preview-segments" id="previewSegments"></div><div class="preview-wave" id="previewWave"></div>';
        
        const wavesurfer = WaveSurfer.create({
            container: document.getElementById('previewWave'),
            waveColor: '#ddd',
            progressColor: '#667eea',
            cursorColor: '#764ba2',
            height: 50,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            normalize: true,
            interact: true
        });
        
        wavesurfer.load(previewUrl);
        state.previewWavesurfer = wavesurfer;
        
        wavesurfer.on('ready', () => {
            previewLoading.style.display = 'none';
            previewWaveform.style.display = 'block';
            previewPlayBtn.disabled = false;
            
            previewTotalDuration = wavesurfer.getDuration();
            document.getElementById('previewDuration').textContent = formatTime(previewTotalDuration);
            
            // 渲染分段颜色条
            renderPreviewSegments();
            // 初始化时间线块进度样式
            initTimelineProgress();
            // 初始化预览波形触摸拖动
            initPreviewWaveformTouch(wavesurfer);
        });
        
        wavesurfer.on('error', () => {
            previewLoading.innerHTML = '<div class="waveform-error">预览加载失败</div>';
        });
        
        const timeDisplay = document.getElementById('previewTimeDisplay');
        const seekTimeEl = document.getElementById('previewSeekTime');
        const seekIcons = ['map-pin', 'target', 'crosshair', 'navigation', 'compass', 'flag', 'bookmark', 'pin', 'locate', 'anchor'];
        
        const updateSeekTimeDisplay = (time) => {
            if (!seekTimeEl) return;
            const randomIcon = seekIcons[Math.floor(Math.random() * seekIcons.length)];
            seekTimeEl.innerHTML = `<i data-lucide="${randomIcon}"></i><span>${formatTime(time)}</span>`;
            refreshIcons();
        };
        
        // 播放进度更新 - 同步三段进度
        const updateProgress = () => {
            const currentTime = wavesurfer.getCurrentTime();
            timeDisplay.textContent = formatTime(currentTime);
            updateAllProgress(currentTime);
        };
        
        wavesurfer.on('audioprocess', updateProgress);
        wavesurfer.on('seeking', () => {
            updateProgress();
            updateSeekTimeDisplay(wavesurfer.getCurrentTime());
        });
        wavesurfer.on('interaction', () => {
            updateProgress();
            updateSeekTimeDisplay(wavesurfer.getCurrentTime());
        });
        
        previewPlayBtn.onclick = () => { wavesurfer.playPause(); };
        
        wavesurfer.on('play', () => { 
            previewPlayBtn.innerHTML = '<i data-lucide="pause"></i>'; 
            refreshIcons(); 
        });
        wavesurfer.on('pause', () => { 
            previewPlayBtn.innerHTML = '<i data-lucide="play"></i>'; 
            refreshIcons(); 
        });
        wavesurfer.on('finish', () => {
            updateAllProgress(0); // 重置进度
        });
        
    } catch (error) {
        console.log('Preview generation failed:', error);
        hidePreview();
    }
}

function renderPreviewSegments() {
    const container = document.getElementById('previewSegments');
    if (!container || previewTotalDuration <= 0) return;
    
    container.innerHTML = previewSegments.map((seg, i) => {
        const widthPercent = ((seg.end - seg.start) / previewTotalDuration) * 100;
        return `<div class="preview-seg" data-seg="${i}" style="width:${widthPercent}%;background:${seg.color}" title="${seg.label}">
            <div class="preview-seg-progress" style="background:${seg.color}"></div>
        </div>`;
    }).join('');
}

function initTimelineProgress() {
    // 给时间线块添加进度遮罩
    document.querySelectorAll('.timeline-item').forEach((item, index) => {
        // 添加进度层
        if (!item.querySelector('.item-progress')) {
            const progressEl = document.createElement('div');
            progressEl.className = 'item-progress';
            item.insertBefore(progressEl, item.firstChild);
        }
    });
}

function updateAllProgress(currentTime) {
    const progress = previewTotalDuration > 0 ? currentTime / previewTotalDuration : 0;
    
    // 1. 更新颜色条进度
    previewSegments.forEach((seg, i) => {
        const segEl = document.querySelector(`.preview-seg[data-seg="${i}"] .preview-seg-progress`);
        if (!segEl) return;
        
        if (currentTime >= seg.end) {
            // 已播完
            segEl.style.width = '100%';
        } else if (currentTime > seg.start) {
            // 正在播放
            const segProgress = (currentTime - seg.start) / (seg.end - seg.start);
            segEl.style.width = (segProgress * 100) + '%';
        } else {
            // 未播放
            segEl.style.width = '0%';
        }
    });
    
    // 2. 更新时间线块进度
    previewSegments.forEach((seg, i) => {
        const itemEl = document.querySelector(`.timeline-item[data-index="${seg.index}"]`);
        if (!itemEl) return;
        
        const progressEl = itemEl.querySelector('.item-progress');
        if (!progressEl) return;
        
        if (currentTime >= seg.end) {
            // 已播完 - 全亮
            progressEl.style.width = '100%';
            itemEl.classList.add('played');
            itemEl.classList.remove('playing');
        } else if (currentTime > seg.start) {
            // 正在播放
            const segProgress = (currentTime - seg.start) / (seg.end - seg.start);
            progressEl.style.width = (segProgress * 100) + '%';
            itemEl.classList.add('playing');
            itemEl.classList.remove('played');
        } else {
            // 未播放 - 变淡
            progressEl.style.width = '0%';
            itemEl.classList.remove('played', 'playing');
        }
    });
}

function hidePreview() {
    const previewSection = document.getElementById('previewSection');
    if (previewSection) previewSection.style.display = 'none';
    
    if (state.previewWavesurfer) {
        state.previewWavesurfer.destroy();
        state.previewWavesurfer = null;
    }
    previewSegments = [];
    previewTotalDuration = 0;
    
    // 清除时间线块的进度状态
    document.querySelectorAll('.timeline-item').forEach(item => {
        item.classList.remove('played', 'playing');
        const progressEl = item.querySelector('.item-progress');
        if (progressEl) progressEl.style.width = '0%';
    });
}

// 预览波形触摸拖动定位 + 长按 2 秒自动播放
function initPreviewWaveformTouch(wavesurfer) {
    const waveformEl = document.getElementById('previewWave');
    const seekTimeEl = document.getElementById('previewSeekTime');
    if (!waveformEl) return;
    
    // 随机图标列表
    const seekIcons = ['map-pin', 'target', 'crosshair', 'navigation', 'compass', 'flag', 'bookmark', 'pin', 'locate', 'anchor'];
    
    const updateSeekTime = (time) => {
        if (!seekTimeEl) return;
        const randomIcon = seekIcons[Math.floor(Math.random() * seekIcons.length)];
        seekTimeEl.innerHTML = `<i data-lucide="${randomIcon}"></i><span>${formatTime(time)}</span>`;
        refreshIcons();
    };
    
    let holdTimer = null;
    let isDragging = false;
    
    const seekToTouch = (touch) => {
        const rect = waveformEl.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const progress = Math.max(0, Math.min(1, x / rect.width));
        wavesurfer.seekTo(progress);
        // 更新定位时间
        updateSeekTime(wavesurfer.getDuration() * progress);
    };
    
    const resetHoldTimer = () => {
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
            if (wavesurfer && !wavesurfer.isPlaying()) {
                wavesurfer.play();
            }
        }, 2000);
    };
    
    const clearHoldTimer = () => {
        if (holdTimer) { 
            clearTimeout(holdTimer); 
            holdTimer = null; 
        }
    };
    
    // PC 端鼠标事件
    waveformEl.addEventListener('mousedown', (e) => {
        isDragging = true;
        resetHoldTimer();
    });
    waveformEl.addEventListener('mouseup', () => {
        isDragging = false;
        clearHoldTimer();
    });
    waveformEl.addEventListener('mouseleave', () => {
        isDragging = false;
        clearHoldTimer();
    });
    waveformEl.addEventListener('mousemove', (e) => { 
        if (e.buttons === 1) resetHoldTimer(); 
    });
    
    // 移动端触摸事件 - 手动处理拖动定位
    waveformEl.addEventListener('touchstart', (e) => {
        isDragging = true;
        seekToTouch(e.touches[0]);
        resetHoldTimer();
    }, { passive: true });
    
    waveformEl.addEventListener('touchmove', (e) => {
        if (isDragging) {
            seekToTouch(e.touches[0]);
            resetHoldTimer();
        }
    }, { passive: true });
    
    waveformEl.addEventListener('touchend', () => {
        isDragging = false;
        clearHoldTimer();
    }, { passive: true });
    
    waveformEl.addEventListener('touchcancel', () => {
        isDragging = false;
        clearHoldTimer();
    }, { passive: true });
}
