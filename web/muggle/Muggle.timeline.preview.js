/**
 * Muggle.timeline.preview.js - 预览波形相关
 * BigEyeMix 麻瓜模式
 */

let previewDebounceTimer = null;
let previewSegments = [];
let previewTotalDuration = 0;

function updatePreviewWaveform() {
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
    
    previewSection.style.display = 'block';
    previewLoading.style.display = 'flex';
    previewWaveform.style.display = 'none';
    previewPlayBtn.disabled = true;
    
    if (state.previewWavesurfer) {
        state.previewWavesurfer.destroy();
        state.previewWavesurfer = null;
    }
    
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
            const gapType = item.gapType || 'ai_fill';
            segments.push({
                file_id: '__gap__',
                start: 0,
                end: item.duration,
                gap_type: gapType
            });
            previewSegments.push({
                index: index,
                start: currentTime,
                end: currentTime + item.duration,
                color: '#e0e0e0',
                label: item.duration + 's',
                isAiFill: gapType === 'ai_fill',
                aiState: item.aiState || (gapType === 'ai_fill' ? 'ai-loading' : '')
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
        const response = await axios.post(API_BASE + '/api/mix/preview', {
            segments: segments,
            transition_type: state.selectedScene || 'cut'
        });
        
        const previewUrl = API_BASE + `/api/audio/${response.data.preview_id}`;
        
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
            
            renderPreviewSegments();
            initTimelineProgress();
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
            updateAllProgress(0);
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
        const isAiFill = seg.isAiFill;
        const aiState = seg.aiState || (isAiFill ? 'ai-loading' : '');
        const extraClass = isAiFill ? `ai-fill-seg ${aiState}` : '';
        
        return `<div class="preview-seg ${extraClass}" data-seg="${i}" style="width:${widthPercent}%;${isAiFill ? '' : 'background:' + seg.color}" title="${seg.label}">
            <div class="preview-seg-progress" style="background:${seg.color}"></div>
        </div>`;
    }).join('');
}

function initTimelineProgress() {
    document.querySelectorAll('.timeline-item').forEach((item, index) => {
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
    
    previewSegments.forEach((seg, i) => {
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
    const previewSection = document.getElementById('previewSection');
    if (previewSection) previewSection.style.display = 'none';
    
    if (state.previewWavesurfer) {
        state.previewWavesurfer.destroy();
        state.previewWavesurfer = null;
    }
    previewSegments = [];
    previewTotalDuration = 0;
    
    document.querySelectorAll('.timeline-item').forEach(item => {
        item.classList.remove('played', 'playing');
        const progressEl = item.querySelector('.item-progress');
        if (progressEl) progressEl.style.width = '0%';
    });
}

function initPreviewWaveformTouch(wavesurfer) {
    const waveformEl = document.getElementById('previewWave');
    const seekTimeEl = document.getElementById('previewSeekTime');
    const timeDisplay = document.getElementById('previewTimeDisplay');
    if (!waveformEl) return;
    
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
        const duration = wavesurfer.getDuration();
        const seekTime = duration * progress;
        
        wavesurfer.setTime(seekTime);
        
        const currentTime = wavesurfer.getCurrentTime();
        if (timeDisplay) timeDisplay.textContent = formatTime(currentTime);
        updateSeekTime(currentTime);
        updateAllProgress(currentTime);
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
    
    waveformEl.addEventListener('mousedown', () => {
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
