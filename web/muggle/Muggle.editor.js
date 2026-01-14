/**
 * Muggle.editor.js - 波形编辑器与片段管理
 * BigEyeMix 麻瓜模式
 */

function renderEditorAndTimeline() {
    const container = document.getElementById('trackEditors');
    const uploadedTracks = state.tracks.filter(t => t.uploaded);
    
    // 初始化默认时间线
    if (state.timeline.length === 0) {
        uploadedTracks.forEach(track => {
            if (track.clips.length > 0) {
                state.timeline.push({ type: 'clip', trackId: track.id, clipId: track.clips[0].id });
            }
        });
    }
    
    container.innerHTML = `
        <div class="editor-section">
            ${uploadedTracks.map(track => `
                <div class="track-editor" data-track="${track.id}">
                    <div class="track-header">
                        <div class="track-label" style="background:${track.color.bg}">${track.label}</div>
                        <div class="track-name">${track.file.name}</div>
                        <div class="track-duration">${formatTime(track.info.duration)}</div>
                    </div>
                    <div class="waveform-container" style="border-left:3px solid ${track.color.bg}">
                        <div class="waveform-loading" id="waveformLoading${track.id}">
                            <div class="waveform-spinner"></div>
                            <div class="waveform-loading-text">加载波形中...</div>
                        </div>
                        <div class="waveform" id="waveform${track.id}" style="display:none;"></div>
                    </div>
                    <div class="playback-controls">
                        <button class="play-btn" id="playBtn${track.id}" style="background:${track.color.bg}" disabled>
                            <i data-lucide="play"></i>
                        </button>
                        <div class="time-display" style="color:${track.color.bg}">${'00:00.0'}</div>
                        <div class="seek-time" id="seekTime${track.id}">
                            <i data-lucide="map-pin"></i>
                            <span>--:--.-</span>
                        </div>
                    </div>
                    <div class="clips-list" id="clipsList${track.id}">
                        ${renderClips(track)}
                    </div>
                    <div class="add-clip-btn" onclick="addClip(${track.id})" style="border-color:${track.color.bg};color:${track.color.bg}">
                        <i data-lucide="plus"></i> 添加片段
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="timeline-section">
            <div class="timeline-title">
                <i data-lucide="layers"></i> 音频混剪拼接
                <span class="timeline-hint">拖拽片段到下方排列</span>
            </div>
            
            <div class="available-blocks">
                <div class="blocks-row">
                    <div class="blocks-label">片段</div>
                    <div class="blocks-list" id="clipBlocks"></div>
                </div>
                <div class="blocks-row">
                    <div class="blocks-label">间隔</div>
                    <div class="blocks-list" id="gapBlocks">
                        ${gapPresets.map(sec => `
                            <div class="block gap-block" draggable="true" data-type="gap" data-duration="${sec}" data-gap-type="ai_fill">
                                <i data-lucide="sparkles"></i> ${sec}s
                            </div>
                        `).join('')}
                        <div class="block gap-add-btn" onclick="showCustomGapModal()">
                            <i data-lucide="plus"></i>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="timeline-drop" id="timelineDrop">
                <div class="timeline-placeholder" id="timelinePlaceholder">
                    <i data-lucide="arrow-down"></i> 拖拽片段到这里
                </div>
                <div class="timeline-items" id="timelineItems"></div>
            </div>
            
            <div class="timeline-actions">
                <button class="btn-clear" onclick="clearTimeline()">
                    <i data-lucide="trash-2"></i> 清空
                </button>
                <div class="timeline-total">
                    总时长: <span id="totalDuration">0:00</span>
                </div>
            </div>
            
            <!-- 预览波形区域 -->
            <div class="preview-section" id="previewSection" style="display:none;">
                <div class="preview-title">
                    <i data-lucide="eye"></i> 拼接预览
                </div>
                <div class="preview-waveform-container">
                    <div class="preview-waveform-loading" id="previewLoading">
                        <div class="waveform-spinner"></div>
                        <div class="waveform-loading-text">生成预览中...</div>
                    </div>
                    <div class="preview-waveform" id="previewWaveform"></div>
                </div>
                <div class="preview-controls">
                    <button class="play-btn preview-play-btn" id="previewPlayBtn" disabled>
                        <i data-lucide="play"></i>
                    </button>
                    <div class="time-display" id="previewTimeDisplay">00:00.0</div>
                    <div class="seek-time" id="previewSeekTime">
                        <i data-lucide="map-pin"></i>
                        <span>--:--.-</span>
                    </div>
                    <div class="preview-duration" id="previewDuration"></div>
                </div>
            </div>
        </div>
    `;
    
    refreshIcons();
    
    uploadedTracks.forEach(track => {
        initWaveform(track);
    });
    
    renderClipBlocks();
    renderTimeline();
    initDragAndDrop();
}

function renderClips(track) {
    return track.clips.map((clip) => `
        <div class="clip-item" data-clip="${clip.id}" style="background:${track.color.light}">
            <span class="clip-tag" style="background:${track.color.bg}">${track.label}${clip.id}</span>
            <div class="clip-times">
                <div class="clip-time-input">
                    <span>始</span>
                    <input type="text" inputmode="numeric" value="${formatTime(clip.start)}" 
                           data-track="${track.id}" data-clip="${clip.id}" data-field="start"
                           onfocus="onTimeFocus(this)"
                           oninput="onTimeInput(this)"
                           onblur="formatClipTimeInput(this, ${track.id}, ${clip.id}, 'start')">
                </div>
                <div class="clip-time-input">
                    <span>末</span>
                    <input type="text" inputmode="numeric" value="${formatTime(clip.end)}" 
                           data-track="${track.id}" data-clip="${clip.id}" data-field="end"
                           onfocus="onTimeFocus(this)"
                           oninput="onTimeInput(this)"
                           onblur="formatClipTimeInput(this, ${track.id}, ${clip.id}, 'end')">
                </div>
            </div>
            ${track.clips.length > 1 ? `
                <button class="clip-remove" onclick="removeClip(${track.id}, ${clip.id})">
                    <i data-lucide="x"></i>
                </button>
            ` : ''}
        </div>
    `).join('');
}

function initWaveform(track) {
    const waveformEl = document.getElementById(`waveform${track.id}`);
    const waveformContainer = waveformEl?.parentElement;
    const loadingEl = document.getElementById(`waveformLoading${track.id}`);
    const playBtn = document.getElementById(`playBtn${track.id}`);
    const seekTimeEl = document.getElementById(`seekTime${track.id}`);
    if (!waveformEl || !waveformContainer) return;
    
    // 随机图标列表
    const seekIcons = ['map-pin', 'target', 'crosshair', 'navigation', 'compass', 'flag', 'bookmark', 'pin', 'locate', 'anchor'];
    
    const updateSeekTime = (time) => {
        if (!seekTimeEl) return;
        const randomIcon = seekIcons[Math.floor(Math.random() * seekIcons.length)];
        seekTimeEl.innerHTML = `<i data-lucide="${randomIcon}"></i><span>${formatTime(time)}</span>`;
        refreshIcons();
    };
    
    const wavesurfer = WaveSurfer.create({
        container: waveformEl,
        waveColor: track.color.light,
        progressColor: track.color.bg,
        cursorColor: track.color.bg,
        height: 60,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: true,
        interact: true
    });
    
    wavesurfer.load(API_BASE + `/api/audio/${track.uploaded.file_id}`);
    track.wavesurfer = wavesurfer;
    
    // 触摸拖动定位 + 长按 2 秒自动播放
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
    waveformEl.addEventListener('mousedown', resetHoldTimer);
    waveformEl.addEventListener('mouseup', clearHoldTimer);
    waveformEl.addEventListener('mouseleave', clearHoldTimer);
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
    
    wavesurfer.on('ready', () => {
        if (loadingEl) loadingEl.style.display = 'none';
        waveformEl.style.display = 'block';
        if (playBtn) playBtn.disabled = false;
    });
    
    wavesurfer.on('error', () => {
        if (loadingEl) loadingEl.innerHTML = '<div class="waveform-error">波形加载失败</div>';
    });
    
    const timeDisplay = playBtn.parentElement.querySelector('.time-display');
    wavesurfer.on('audioprocess', () => { timeDisplay.textContent = formatTime(wavesurfer.getCurrentTime()); });
    wavesurfer.on('seeking', () => { 
        timeDisplay.textContent = formatTime(wavesurfer.getCurrentTime()); 
        updateSeekTime(wavesurfer.getCurrentTime());
    });
    wavesurfer.on('interaction', () => { 
        timeDisplay.textContent = formatTime(wavesurfer.getCurrentTime()); 
        updateSeekTime(wavesurfer.getCurrentTime());
    });
    
    playBtn.addEventListener('click', () => { wavesurfer.playPause(); });
    
    wavesurfer.on('play', () => { playBtn.innerHTML = '<i data-lucide="pause"></i>'; refreshIcons(); });
    wavesurfer.on('pause', () => { playBtn.innerHTML = '<i data-lucide="play"></i>'; refreshIcons(); });
}

window.addClip = function(trackId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const newId = Math.max(...track.clips.map(c => c.id), 0) + 1;
    track.clips.push({ id: newId, start: 0, end: track.info.duration });
    
    document.getElementById(`clipsList${trackId}`).innerHTML = renderClips(track);
    refreshIcons();
    renderClipBlocks();
};

window.removeClip = function(trackId, clipId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track || track.clips.length <= 1) return;
    
    track.clips = track.clips.filter(c => c.id !== clipId);
    state.timeline = state.timeline.filter(item => 
        !(item.type === 'clip' && item.trackId === trackId && item.clipId === clipId)
    );
    
    document.getElementById(`clipsList${trackId}`).innerHTML = renderClips(track);
    refreshIcons();
    renderClipBlocks();
    renderTimeline();
};

window.updateClipTime = function(trackId, clipId, field, value) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const clip = track.clips.find(c => c.id === clipId);
    if (!clip) return;
    
    clip[field] = parseTime(value);
    updatePreviewWaveform();
};

// 聚焦时清空并将光标放在最前面
window.onTimeFocus = function(input) {
    // 选中全部文本，方便直接输入覆盖
    setTimeout(() => {
        input.select();
    }, 0);
};

// 实时格式化输入 - 输入过程中自动添加 : 和 .
window.onTimeInput = function(input) {
    let value = input.value;
    
    // 只保留数字
    let digits = value.replace(/[^0-9]/g, '');
    
    // 限制最多6位数字
    digits = digits.slice(0, 6);
    
    // 根据数字长度自动格式化
    let formatted = '';
    if (digits.length <= 2) {
        formatted = digits;
    } else if (digits.length <= 4) {
        formatted = digits.slice(0, 2) + ':' + digits.slice(2);
    } else {
        formatted = digits.slice(0, 2) + ':' + digits.slice(2, 4) + '.' + digits.slice(4);
    }
    
    input.value = formatted;
    
    // 实时更新数据
    const trackId = parseInt(input.dataset.track);
    const clipId = parseInt(input.dataset.clip);
    const field = input.dataset.field;
    
    const track = state.tracks.find(t => t.id === trackId);
    if (track) {
        const clip = track.clips.find(c => c.id === clipId);
        if (clip) {
            clip[field] = parseTime(formatted);
        }
    }
};

// 输入框失焦时完整格式化显示
window.formatClipTimeInput = function(input, trackId, clipId, field) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const clip = track.clips.find(c => c.id === clipId);
    if (!clip) return;
    
    // 解析并更新值
    const seconds = parseTime(input.value);
    clip[field] = seconds;
    
    // 格式化显示
    input.value = formatTime(seconds);
    
    updatePreviewWaveform();
};
