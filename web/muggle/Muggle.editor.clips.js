/**
 * Muggle.editor.clips.js - 片段管理和时间输入
 * BigEyeMix 麻瓜模式
 */

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

// 聚焦时选中全部文本
window.onTimeFocus = function(input) {
    setTimeout(() => {
        input.select();
    }, 0);
};

// 实时格式化输入
window.onTimeInput = function(input) {
    let value = input.value;
    let digits = value.replace(/[^0-9]/g, '');
    digits = digits.slice(0, 6);
    
    let formatted = '';
    if (digits.length <= 2) {
        formatted = digits;
    } else if (digits.length <= 4) {
        formatted = digits.slice(0, 2) + ':' + digits.slice(2);
    } else {
        formatted = digits.slice(0, 2) + ':' + digits.slice(2, 4) + '.' + digits.slice(4);
    }
    
    input.value = formatted;
    
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
    
    const seconds = parseTime(input.value);
    clip[field] = seconds;
    input.value = formatTime(seconds);
    
    updatePreviewWaveform();
};

// ==================== Seek Time 拖拽到输入框 ====================

let seekDragData = null;
let seekDragClone = null;

function initSeekTimeDrag() {
    // seek-time 和 time-display 都支持拖拽
    document.querySelectorAll('.seek-time, .time-display').forEach(seekEl => {
        seekEl.addEventListener('touchstart', handleSeekDragStart, { passive: false });
        seekEl.addEventListener('touchmove', handleSeekDragMove, { passive: false });
        seekEl.addEventListener('touchend', handleSeekDragEnd);
        seekEl.addEventListener('mousedown', handleSeekMouseDown);
    });
}

function handleSeekDragStart(e) {
    e.preventDefault();
    const seekEl = e.currentTarget;
    // time-display 直接取 textContent，seek-time 取 span 内容
    let timeText = seekEl.classList.contains('time-display') 
        ? seekEl.textContent 
        : seekEl.querySelector('span')?.textContent;
    if (!timeText || timeText === '--:--.-') return;
    
    seekDragData = {
        time: timeText.trim(),
        trackId: seekEl.closest('.track-editor')?.dataset.track
    };
    
    seekEl.classList.add('dragging');
    const touch = e.touches[0];
    createSeekClone(seekEl, touch.clientX, touch.clientY);
}

function handleSeekMouseDown(e) {
    const seekEl = e.currentTarget;
    // time-display 直接取 textContent，seek-time 取 span 内容
    let timeText = seekEl.classList.contains('time-display') 
        ? seekEl.textContent 
        : seekEl.querySelector('span')?.textContent;
    if (!timeText || timeText === '--:--.-') return;
    
    seekDragData = {
        time: timeText.trim(),
        trackId: seekEl.closest('.track-editor')?.dataset.track
    };
    
    seekEl.classList.add('dragging');
    createSeekClone(seekEl, e.clientX, e.clientY);
    
    document.addEventListener('mousemove', handleSeekMouseMove);
    document.addEventListener('mouseup', handleSeekMouseUp);
}

function createSeekClone(el, x, y) {
    seekDragClone = document.createElement('div');
    seekDragClone.className = 'seek-drag-clone';
    seekDragClone.textContent = seekDragData.time;
    seekDragClone.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        pointer-events: none;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    `;
    document.body.appendChild(seekDragClone);
}

function handleSeekDragMove(e) {
    if (!seekDragData || !seekDragClone) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    seekDragClone.style.left = touch.clientX + 'px';
    seekDragClone.style.top = touch.clientY + 'px';
    highlightDropTarget(touch.clientX, touch.clientY);
}

function handleSeekMouseMove(e) {
    if (!seekDragData || !seekDragClone) return;
    
    seekDragClone.style.left = e.clientX + 'px';
    seekDragClone.style.top = e.clientY + 'px';
    highlightDropTarget(e.clientX, e.clientY);
}

function highlightDropTarget(x, y) {
    document.querySelectorAll('.clip-time-input input').forEach(input => {
        input.classList.remove('drop-target');
    });
    
    const el = document.elementFromPoint(x, y);
    if (el && el.tagName === 'INPUT' && el.closest('.clip-time-input')) {
        const inputTrackId = el.dataset.track;
        if (!seekDragData.trackId || inputTrackId === seekDragData.trackId) {
            el.classList.add('drop-target');
        }
    }
}

function handleSeekDragEnd(e) {
    if (!seekDragData) return;
    
    const touch = e.changedTouches[0];
    applySeekToInput(touch.clientX, touch.clientY);
    cleanupSeekDrag();
}

function handleSeekMouseUp(e) {
    if (!seekDragData) return;
    
    applySeekToInput(e.clientX, e.clientY);
    cleanupSeekDrag();
    
    document.removeEventListener('mousemove', handleSeekMouseMove);
    document.removeEventListener('mouseup', handleSeekMouseUp);
}

function applySeekToInput(x, y) {
    const el = document.elementFromPoint(x, y);
    if (el && el.tagName === 'INPUT' && el.closest('.clip-time-input')) {
        const inputTrackId = el.dataset.track;
        if (!seekDragData.trackId || inputTrackId === seekDragData.trackId) {
            el.value = seekDragData.time;
            
            const trackId = parseInt(el.dataset.track);
            const clipId = parseInt(el.dataset.clip);
            const field = el.dataset.field;
            
            const track = state.tracks.find(t => t.id === trackId);
            if (track) {
                const clip = track.clips.find(c => c.id === clipId);
                if (clip) {
                    clip[field] = parseTime(seekDragData.time);
                    updatePreviewWaveform();
                }
            }
            
            el.style.transition = 'background 0.3s';
            el.style.background = 'rgba(102, 126, 234, 0.3)';
            setTimeout(() => {
                el.style.background = '';
            }, 300);
        }
    }
}

function cleanupSeekDrag() {
    if (seekDragClone) {
        seekDragClone.remove();
        seekDragClone = null;
    }
    
    document.querySelectorAll('.seek-time.dragging, .time-display.dragging').forEach(el => {
        el.classList.remove('dragging');
    });
    
    document.querySelectorAll('.clip-time-input input.drop-target').forEach(el => {
        el.classList.remove('drop-target');
    });
    
    seekDragData = null;
}

// 在渲染编辑器后初始化拖拽
const originalRenderEditorAndTimeline = renderEditorAndTimeline;
window.renderEditorAndTimeline = function() {
    originalRenderEditorAndTimeline();
    setTimeout(initSeekTimeDrag, 100);
};
