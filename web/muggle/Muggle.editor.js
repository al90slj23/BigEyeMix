/**
 * Muggle.editor.js - 波形编辑器渲染
 * BigEyeMix 麻瓜模式
 */

function renderEditorAndTimeline() {
    const container = document.getElementById('trackEditors');
    const uploadedTracks = state.tracks.filter(t => t.uploaded);
    
    // 不再自动初始化 timeline，让用户通过麻瓜拼接或手动拼接来创建
    // if (state.timeline.length === 0) {
    //     uploadedTracks.forEach(track => {
    //         if (track.clips.length > 0) {
    //             state.timeline.push({ type: 'clip', trackId: track.id, clipId: track.clips[0].id });
    //         }
    //     });
    // }
    
    container.innerHTML = `
        <div class="editor-section">
            ${uploadedTracks.map(track => `
                <div class="track-editor" data-track="${track.id}">
                    <div class="track-header">
                        <div class="track-label" style="background:${track.color.bg}" onclick="showColorPicker(${track.id})">${track.label}</div>
                        <div class="track-name">${track.file.name}</div>
                        <div class="track-duration">${formatTime(track.info.duration)}</div>
                    </div>
                    <div class="waveform-wrapper" id="waveformWrapper${track.id}">
                        <div class="waveform-main">
                            <div class="scroll-edge scroll-edge-left" id="scrollLeft${track.id}">
                                <i data-lucide="chevrons-left"></i>
                            </div>
                            <div class="scroll-edge scroll-edge-right" id="scrollRight${track.id}">
                                <i data-lucide="chevrons-right"></i>
                            </div>
                            <div class="waveform-container" id="waveformContainer${track.id}" style="border-left:3px solid ${track.color.bg}">
                                <div class="waveform-loading" id="waveformLoading${track.id}">
                                    <div class="waveform-spinner"></div>
                                    <div class="waveform-loading-text">加载波形中...</div>
                                </div>
                                <div class="waveform" id="waveform${track.id}" style="display:none;"></div>
                            </div>
                            <div class="waveform-ruler" id="waveformRuler${track.id}" style="background:${track.color.bg}">
                                <div class="ruler-handle ruler-handle-top" style="background:${track.color.bg}"></div>
                                <div class="ruler-handle ruler-handle-bottom" style="background:${track.color.bg}"></div>
                            </div>
                        </div>
                        <div class="waveform-zoom-btns">
                            <button class="zoom-btn zoom-in" data-track="${track.id}" style="color:${track.color.bg}">
                                <i data-lucide="zoom-in"></i>
                            </button>
                            <button class="zoom-btn zoom-out" data-track="${track.id}" style="color:${track.color.bg}">
                                <i data-lucide="zoom-out"></i>
                            </button>
                        </div>
                    </div>
                    <div class="waveform-navigator" id="waveformNavigator${track.id}">
                        <div class="navigator-wave" id="navigatorWave${track.id}"></div>
                        <div class="navigator-viewport" id="navigatorViewport${track.id}" style="border-color:${track.color.bg};background:${track.color.bg}20"></div>
                        <div class="navigator-cursor" id="navigatorCursor${track.id}" style="background:${track.color.bg}"></div>
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
                        <i data-lucide="plus"></i> 添加待用片段
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="timeline-section">
            <div class="timeline-tabs">
                <div class="timeline-tab active" data-tab="muggle">
                    <i data-lucide="sparkles"></i> 麻瓜拼接
                </div>
                <div class="timeline-tab" data-tab="manual">
                    <i data-lucide="settings"></i> 手动拼接
                </div>
            </div>
            
            <!-- 麻瓜拼接标签页 -->
            <div class="timeline-tab-content active" data-tab="muggle">
                <div class="muggle-splice-section">
                    <div class="muggle-input-area">
                        <div class="muggle-input-label">
                            <i data-lucide="message-circle"></i>
                            请大眼怪描述你想要的拼接效果
                        </div>
                        <textarea 
                            id="muggleSpliceInput" 
                            class="muggle-input" 
                            placeholder="例如：知我 1分56到2分34 不要，剩下的部分加上春颂整段..."
                            rows="4"></textarea>
                        <div class="muggle-action-buttons">
                            <button class="voice-input-btn" id="voiceInputBtn" title="语音输入">
                                <i data-lucide="mic"></i>
                            </button>
                            <button class="muggle-generate-btn" id="muggleGenerateBtn">
                                <i data-lucide="sparkles"></i> 点击理解拼接方案
                            </button>
                        </div>
                    </div>
                    <div class="muggle-result-area" id="muggleResultArea" style="display:none;">
                        <div class="muggle-result-header">
                            <i data-lucide="check-circle"></i>
                            请确认大眼怪想要表达的拼接方案
                            <button class="json-info-btn" id="muggleJsonInfoBtn" title="查看机器指令">
                                <i data-lucide="help-circle"></i>
                            </button>
                        </div>
                        <div class="muggle-result-content" id="muggleResultContent"></div>
                        <div class="muggle-json-modal" id="muggleJsonModal" style="display: none;">
                            <div class="json-modal-overlay" id="muggleJsonModalOverlay"></div>
                            <div class="json-modal-content">
                                <div class="json-modal-header">
                                    <h3>机器使用的拼接指令（JSON）</h3>
                                    <button class="json-modal-close" id="muggleJsonModalClose">
                                        <i data-lucide="x"></i>
                                    </button>
                                </div>
                                <pre class="json-modal-body" id="muggleJsonModalBody"></pre>
                            </div>
                        </div>
                        <div class="muggle-result-actions">
                            <button class="btn-apply" id="muggleApplyBtn">
                                <i data-lucide="play"></i> 应用方案
                            </button>
                            <button class="btn-regenerate" id="muggleRegenerateBtn">
                                <i data-lucide="refresh-cw"></i> 重新生成
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 手动拼接标签页 -->
            <div class="timeline-tab-content" data-tab="manual">
                <div class="available-blocks">
                    <div class="blocks-row">
                        <div class="blocks-label">片段</div>
                        <div class="blocks-list" id="clipBlocks"></div>
                    </div>
                    <div class="blocks-row">
                        <div class="blocks-label">处理</div>
                        <div class="blocks-list" id="transitionBlocks">
                            <div class="block transition-block" draggable="true" data-type="transition" data-duration="3" data-transition-type="crossfade">
                                <i data-lucide="git-merge"></i> 3s
                            </div>
                            <div class="block transition-block" draggable="true" data-type="transition" data-duration="3" data-transition-type="beatsync">
                                <i data-lucide="activity"></i> 3s
                            </div>
                            <div class="block transition-block" draggable="true" data-type="transition" data-duration="3" data-transition-type="magicfill">
                                <i data-lucide="sparkles"></i> 3s
                            </div>
                            <div class="block transition-block" draggable="true" data-type="transition" data-duration="3" data-transition-type="silence">
                                <i data-lucide="volume-x"></i> 3s
                            </div>
                            <div class="block transition-add-btn" onclick="showCustomTransitionModal()">
                                <i data-lucide="plus"></i>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="blocks-row">
                    <div class="blocks-label">拼接</div>
                    <div class="timeline-drop" id="timelineDrop" style="flex: 1;">
                        <div class="timeline-placeholder" id="timelinePlaceholder">
                            <i data-lucide="arrow-down"></i> 拖拽片段到这里
                        </div>
                        <div class="timeline-items" id="timelineItems"></div>
                        <div class="timeline-trash" id="timelineTrash">
                            <i data-lucide="trash-2"></i>
                        </div>
                    </div>
                </div>
                
                <div class="timeline-actions">
                    <button class="btn-clear" onclick="confirmClearTimeline()">
                        <i data-lucide="trash-2"></i> 清空
                    </button>
                    <div class="timeline-total">
                        总时长: <span id="totalDuration">0:00</span>
                    </div>
                </div>
                
                <!-- 魔法填充状态日志 -->
                <div class="magic-status-box" id="magicStatusBox" style="display:none;">
                    <div class="magic-status-header">
                        <i data-lucide="sparkles"></i>
                        <span>魔法填充</span>
                        <span class="magic-status-badge" id="magicStatusBadge">等待中</span>
                    </div>
                    <div class="magic-status-logs" id="magicStatusLogs"></div>
                </div>
            </div>
        </div>
        
        <!-- 独立的预览区域 -->
        <div class="preview-section-wrapper" id="previewSectionWrapper" style="display:none;">
            <div class="preview-section" id="previewSection">
                <div class="preview-header">
                    <div class="preview-title">
                        <i data-lucide="eye"></i> 预览
                    </div>
                    <div class="preview-duration" id="previewDuration"></div>
                </div>
                <div class="preview-waveform-wrapper waveform-wrapper" id="previewWaveformWrapper">
                    <!-- 预览片段显示条 -->
                    <div class="preview-segments" id="previewSegments"></div>
                    <div class="waveform-main">
                        <div class="scroll-edge scroll-edge-left" id="previewScrollLeft">
                            <i data-lucide="chevrons-left"></i>
                        </div>
                        <div class="scroll-edge scroll-edge-right" id="previewScrollRight">
                            <i data-lucide="chevrons-right"></i>
                        </div>
                        <div class="waveform-container" id="previewWaveformContainer" style="border-left:3px solid #667eea">
                            <div class="waveform-loading" id="previewLoading">
                                <div class="waveform-spinner"></div>
                                <div class="waveform-loading-text">生成预览中...</div>
                            </div>
                            <div class="waveform" id="previewWaveform" style="display:none;"></div>
                        </div>
                        <div class="waveform-ruler" id="previewRuler" style="background:#667eea">
                            <div class="ruler-handle ruler-handle-top" style="background:#667eea"></div>
                            <div class="ruler-handle ruler-handle-bottom" style="background:#667eea"></div>
                        </div>
                    </div>
                    <div class="waveform-zoom-btns">
                        <button class="zoom-btn zoom-in" id="previewZoomIn" style="color:#667eea">
                            <i data-lucide="zoom-in"></i>
                        </button>
                        <button class="zoom-btn zoom-out" id="previewZoomOut" style="color:#667eea">
                            <i data-lucide="zoom-out"></i>
                        </button>
                    </div>
                </div>
                <div class="waveform-navigator" id="previewNavigator">
                    <div class="navigator-wave" id="previewNavigatorWave"></div>
                    <div class="navigator-viewport" id="previewNavigatorViewport" style="border-color:#667eea;background:rgba(102,126,234,0.12)"></div>
                    <div class="navigator-cursor" id="previewNavigatorCursor" style="background:#667eea"></div>
                </div>
                <div class="preview-controls playback-controls">
                    <button class="play-btn preview-play-btn" id="previewPlayBtn" style="background:#667eea" disabled>
                        <i data-lucide="play"></i>
                    </button>
                    <div class="time-display" id="previewTimeDisplay" style="color:#667eea">00:00.0</div>
                    <div class="seek-time" id="previewSeekTime">
                        <i data-lucide="map-pin"></i>
                        <span>--:--.-</span>
                    </div>
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
    
    // 初始化麻瓜拼接功能
    if (typeof initMuggleSpliceFeatures === 'function') {
        initMuggleSpliceFeatures();
    }
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
    const waveformContainer = document.getElementById(`waveformContainer${track.id}`);
    const waveformWrapper = document.getElementById(`waveformWrapper${track.id}`);
    const loadingEl = document.getElementById(`waveformLoading${track.id}`);
    const playBtn = document.getElementById(`playBtn${track.id}`);
    const seekTimeEl = document.getElementById(`seekTime${track.id}`);
    const rulerEl = document.getElementById(`waveformRuler${track.id}`);
    const scrollLeftEl = document.getElementById(`scrollLeft${track.id}`);
    const scrollRightEl = document.getElementById(`scrollRight${track.id}`);
    
    if (!waveformEl || !waveformContainer) return;
    
    const seekIcons = ['map-pin', 'target', 'crosshair', 'navigation', 'compass', 'flag', 'bookmark', 'pin', 'locate', 'anchor'];
    
    const updateSeekTime = (time) => {
        if (!seekTimeEl) return;
        const randomIcon = seekIcons[Math.floor(Math.random() * seekIcons.length)];
        seekTimeEl.innerHTML = `<i data-lucide="${randomIcon}"></i><span>${formatTime(time)}</span>`;
        refreshIcons();
    };
    
    // 创建 WaveSurfer 实例
    const wavesurfer = WaveSurfer.create({
        container: waveformEl,
        waveColor: track.color.light,
        progressColor: track.color.light,
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
    
    track.wavesurfer = wavesurfer;
    
    // 尝试使用预计算波形数据加速加载
    loadWaveformWithCache(wavesurfer, track.uploaded.file_id, loadingEl);
    
    const timeDisplay = playBtn.parentElement.querySelector('.time-display');
    
    // ==================== 状态变量 ====================
    let rulerDragging = false;
    let isPlaying = false;
    let currentZoom = 1;
    let isAutoScrolling = false; // 防止滚动事件循环
    
    // ==================== 标尺卡 ====================
    // 更新标尺位置（相对于waveform-main，使用像素定位）
    const updateRulerPosition = (progress, autoScroll = false) => {
        if (!rulerEl) return;
        
        // 使用 WaveSurfer 的 scrollContainer
        const scrollContainer = wavesurfer?.renderer?.scrollContainer;
        if (!scrollContainer) return;
        
        const scrollWidth = scrollContainer.scrollWidth;
        const containerWidth = scrollContainer.clientWidth;
        const scrollLeft = scrollContainer.scrollLeft;
        
        // waveform-container 的 padding-left (10px) + border-left (3px)
        const containerPadding = 13;
        
        // 标尺在整个波形中的绝对位置
        const absoluteX = progress * scrollWidth;
        // 相对于可视区域的位置，加上容器 padding
        let visibleX = absoluteX - scrollLeft + containerPadding;
        
        // 限制标尺在可见区域内（防止被 overflow:hidden 裁剪）
        // 但保留一点超出以显示完整的 handle
        const minX = containerPadding - 12; // handle 半径
        const maxX = containerWidth + containerPadding + 12;
        visibleX = Math.max(minX, Math.min(maxX, visibleX));
        
        // 设置标尺位置
        rulerEl.style.left = visibleX + 'px';
        
        // 播放时自动滚动：当标尺接近边缘时，滚动波形让标尺保持在中间
        if (autoScroll && isPlaying && currentZoom > 1 && !isAutoScrolling) {
            const centerX = containerWidth / 2;
            const threshold = containerWidth * 0.6; // 60%位置开始滚动
            
            if (visibleX > threshold && scrollLeft < scrollWidth - containerWidth) {
                isAutoScrolling = true;
                const newScrollLeft = absoluteX - centerX;
                scrollContainer.scrollLeft = Math.min(newScrollLeft, scrollWidth - containerWidth);
                // 重新计算标尺位置
                const newVisibleX = absoluteX - scrollContainer.scrollLeft;
                rulerEl.style.left = newVisibleX + 'px';
                setTimeout(() => { isAutoScrolling = false; }, 50);
            }
        }
        
        // 更新导航条的播放位置指示器
        updateNavigatorCursor(progress);
    };
    
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
        
        const currentTime = wavesurfer.getCurrentTime();
        timeDisplay.textContent = formatTime(currentTime);
        updateSeekTime(currentTime);
    };
    
    // 点击波形区域定位
    waveformContainer.addEventListener('click', (e) => {
        if (rulerDragging) return;
        seekFromRuler(e.clientX);
    });
    
    if (rulerEl) {
        const rulerHandles = rulerEl.querySelectorAll('.ruler-handle');
        
        // 为所有手柄绑定事件
        rulerHandles.forEach(handle => {
            // 触摸拖动标尺
            handle.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                e.preventDefault();
                rulerDragging = true;
                rulerEl.classList.add('dragging');
            });
            
            // 鼠标拖动标尺
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
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
            if (rulerDragging) {
                rulerDragging = false;
                rulerEl.classList.remove('dragging');
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (rulerDragging) {
                seekFromRuler(e.clientX);
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (rulerDragging) {
                rulerDragging = false;
                rulerEl.classList.remove('dragging');
            }
        });
    }
    
    wavesurfer.on('ready', () => {
        if (loadingEl) loadingEl.style.display = 'none';
        waveformEl.style.display = 'block';
        // 不要立即启用播放按钮，等待音频加载完成
        
        // 延迟初始化标尺位置，等待渲染完成
        setTimeout(() => {
            updateRulerPosition(0);
            updateScrollEdges();
        }, 100);
    });
    
    // 当音频真正可以播放时才启用播放按钮
    wavesurfer.on('decode', () => {
        if (playBtn) playBtn.disabled = false;
        console.log(`[Waveform] Audio decoded and ready to play for track ${track.id}`);
    });
    
    wavesurfer.on('error', () => {
        if (loadingEl) loadingEl.innerHTML = '<div class="waveform-error">波形加载失败</div>';
        if (playBtn) playBtn.disabled = true;
    });
    
    const updateTimeDisplay = () => {
        const currentTime = wavesurfer.getCurrentTime();
        timeDisplay.textContent = formatTime(currentTime);
    };
    
    wavesurfer.on('audioprocess', () => {
        updateTimeDisplay();
        const duration = wavesurfer.getDuration();
        if (duration > 0) {
            const progress = wavesurfer.getCurrentTime() / duration;
            updateRulerPosition(progress, true); // 播放时允许自动滚动
        }
    });
    wavesurfer.on('seeking', () => { 
        updateTimeDisplay();
        updateSeekTime(wavesurfer.getCurrentTime());
        const duration = wavesurfer.getDuration();
        if (duration > 0) {
            const progress = wavesurfer.getCurrentTime() / duration;
            updateRulerPosition(progress, false); // seek时不自动滚动
        }
    });
    wavesurfer.on('timeupdate', (currentTime) => {
        timeDisplay.textContent = formatTime(currentTime);
    });
    
    playBtn.addEventListener('click', () => { 
        wavesurfer.playPause(); 
    });
    
    wavesurfer.on('play', () => { 
        isPlaying = true;
        playBtn.innerHTML = '<i data-lucide="pause"></i>'; 
        refreshIcons(); 
    });
    wavesurfer.on('pause', () => { 
        isPlaying = false;
        playBtn.innerHTML = '<i data-lucide="play"></i>'; 
        refreshIcons(); 
    });
    
    // ==================== 滚动边缘指示器 ====================
    const updateScrollEdges = () => {
        if (!scrollLeftEl || !scrollRightEl || !waveformContainer) return;
        
        const { scrollLeft, scrollWidth, clientWidth } = waveformContainer;
        const canScrollLeft = scrollLeft > 5;
        const canScrollRight = scrollLeft < scrollWidth - clientWidth - 5;
        
        scrollLeftEl.classList.toggle('show', canScrollLeft);
        scrollRightEl.classList.toggle('show', canScrollRight);
    };
    
    // 滚动时更新
    const onScroll = () => {
        if (isAutoScrolling) return; // 自动滚动时不处理
        updateScrollEdges();
        updateViewport();
        // 滚动时更新标尺位置（不触发自动滚动）
        const duration = wavesurfer.getDuration();
        if (duration > 0) {
            const progress = wavesurfer.getCurrentTime() / duration;
            updateRulerPosition(progress, false);
        }
    };
    
    // 监听 WaveSurfer 的 scroll 事件
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
    
    // ==================== 缩放功能 ====================
    let baseZoom = 1;  // 基础缩放值（让波形刚好填满容器）
    const minZoomMultiplier = 1;   // 最小缩放倍数（1x = 显示全部）
    const maxZoomMultiplier = 50;  // 最大缩放倍数
    
    const zoomInBtn = document.querySelector(`.zoom-btn.zoom-in[data-track="${track.id}"]`);
    const zoomOutBtn = document.querySelector(`.zoom-btn.zoom-out[data-track="${track.id}"]`);
    const zoomResetBtn = document.querySelector(`.zoom-btn.zoom-reset[data-track="${track.id}"]`);
    
    const applyZoom = (newMultiplier) => {
        currentZoom = Math.max(minZoomMultiplier, Math.min(maxZoomMultiplier, newMultiplier));
        const actualZoom = baseZoom * currentZoom;
        wavesurfer.zoom(actualZoom);
    };
    
    // 在 ready 事件中计算 baseZoom
    wavesurfer.once('ready', () => {
        const duration = wavesurfer.getDuration();
        const containerWidth = waveformContainer.clientWidth - 20; // 减去 padding
        if (duration > 0 && containerWidth > 0) {
            baseZoom = containerWidth / duration;  // 每秒像素数，让波形刚好填满
            wavesurfer.zoom(baseZoom);  // 应用初始缩放
        }
    });
    
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => applyZoom(currentZoom * 1.5));
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => applyZoom(currentZoom / 1.5));
    }
    if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', () => applyZoom(1)); // 复原到 1x
    }
    
    // 双指缩放手势
    let initialPinchDistance = 0;
    let initialZoom = 1;
    
    const getDistance = (touches) => {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };
    
    waveformContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            initialPinchDistance = getDistance(e.touches);
            initialZoom = currentZoom;
        }
    }, { passive: false });
    
    waveformContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = getDistance(e.touches);
            const scale = currentDistance / initialPinchDistance;
            applyZoom(initialZoom * scale);
        }
    }, { passive: false });
    
    // ==================== Navigator 导航条 ====================
    const navigatorContainer = document.getElementById(`waveformNavigator${track.id}`);
    const navigatorWaveEl = document.getElementById(`navigatorWave${track.id}`);
    const navigatorViewport = document.getElementById(`navigatorViewport${track.id}`);
    const navigatorCursor = document.getElementById(`navigatorCursor${track.id}`);
    
    let navigatorWavesurfer = null;
    
    if (navigatorWaveEl) {
        navigatorWavesurfer = WaveSurfer.create({
            container: navigatorWaveEl,
            waveColor: track.color.light,
            progressColor: track.color.bg,
            cursorColor: 'transparent',
            height: 24,
            barWidth: 1,
            barGap: 0,
            barRadius: 0,
            normalize: true,
            interact: false
        });
        
        navigatorWavesurfer.load(API_BASE + `/api/audio/${track.uploaded.file_id}`);
        track.navigatorWavesurfer = navigatorWavesurfer;
    }
    
    // 更新导航条视口框（始终显示，宽度随缩放变化）
    const updateViewport = () => {
        if (!navigatorViewport) return;
        
        // 使用 WaveSurfer 的 scrollContainer 来计算视口
        const scrollContainer = wavesurfer?.renderer?.scrollContainer;
        if (!scrollContainer) return;
        
        const scrollWidth = scrollContainer.scrollWidth;
        const containerWidth = scrollContainer.clientWidth;
        const scrollLeft = scrollContainer.scrollLeft;
        
        // 计算视口宽度百分比（未放大时为100%）
        const viewportWidthPercent = (containerWidth / scrollWidth) * 100;
        // 计算视口左边位置百分比
        const viewportLeftPercent = (scrollLeft / scrollWidth) * 100;
        
        navigatorViewport.style.width = viewportWidthPercent + '%';
        navigatorViewport.style.left = viewportLeftPercent + '%';
        // 始终显示视口框
        navigatorViewport.style.display = 'block';
    };
    
    // 更新导航条播放位置指示器
    const updateNavigatorCursor = (progress) => {
        if (!navigatorCursor) return;
        const percent = Math.max(0, Math.min(100, progress * 100));
        navigatorCursor.style.left = percent + '%';
    };
    
    // wavesurfer ready 时初始化视口
    wavesurfer.on('ready', () => {
        setTimeout(updateViewport, 100);
    });
    
    let navigatorDragging = false;
    
    const navigateFromNavigator = (clientX) => {
        if (!navigatorContainer) return;
        
        // 使用 WaveSurfer 的 scrollContainer
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
            e.preventDefault();
            navigatorDragging = true;
            navigateFromNavigator(e.touches[0].clientX);
        }, { passive: false });
        
        navigatorContainer.addEventListener('touchmove', (e) => {
            if (navigatorDragging) {
                e.preventDefault();
                navigateFromNavigator(e.touches[0].clientX);
            }
        }, { passive: false });
        
        navigatorContainer.addEventListener('touchend', () => {
            navigatorDragging = false;
        });
        
        navigatorContainer.addEventListener('mousedown', (e) => {
            navigatorDragging = true;
            navigateFromNavigator(e.clientX);
        });
        
        document.addEventListener('mousemove', (e) => {
            if (navigatorDragging) {
                navigateFromNavigator(e.clientX);
            }
        });
        
        document.addEventListener('mouseup', () => {
            navigatorDragging = false;
        });
    }
    
    // 同步导航条波形的播放进度显示
    if (navigatorWavesurfer) {
        wavesurfer.on('audioprocess', () => {
            const time = wavesurfer.getCurrentTime();
            if (navigatorWavesurfer.getDuration() > 0) {
                navigatorWavesurfer.setTime(time);
            }
        });
        wavesurfer.on('seeking', () => {
            const time = wavesurfer.getCurrentTime();
            if (navigatorWavesurfer.getDuration() > 0) {
                navigatorWavesurfer.setTime(time);
            }
        });
    }
}


// ==================== 颜色选择器 ====================
function showColorPicker(trackId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;
    
    // 创建颜色选择器弹窗
    const overlay = document.createElement('div');
    overlay.className = 'color-picker-overlay';
    overlay.innerHTML = `
        <div class="color-picker-modal">
            <div class="color-picker-title">选择轨道颜色</div>
            <div class="color-picker-grid">
                ${trackColors.map((color, idx) => `
                    <div class="color-picker-item ${track.color.name === color.name ? 'selected' : ''}" 
                         data-color-idx="${idx}" 
                         style="background:${color.bg}">
                        ${track.color.name === color.name ? '<i data-lucide="check"></i>' : ''}
                    </div>
                `).join('')}
            </div>
            <button class="color-picker-close" onclick="closeColorPicker()">取消</button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    refreshIcons();
    
    // 绑定颜色选择事件
    overlay.querySelectorAll('.color-picker-item').forEach(item => {
        item.addEventListener('click', () => {
            const colorIdx = parseInt(item.dataset.colorIdx);
            const newColor = trackColors[colorIdx];
            track.color = newColor;
            closeColorPicker();
            // 重新渲染编辑器
            renderEditorAndTimeline();
        });
    });
    
    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeColorPicker();
        }
    });
}

function closeColorPicker() {
    const overlay = document.querySelector('.color-picker-overlay');
    if (overlay) {
        overlay.remove();
    }
}
