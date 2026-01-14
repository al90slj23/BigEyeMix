/**
 * Muggle.timeline.js - 时间线渲染核心
 * BigEyeMix 麻瓜模式
 * 
 * 依赖文件:
 * - Muggle.timeline.drag.js (拖拽处理)
 * - Muggle.timeline.preview.js (预览波形)
 * - Muggle.timeline.ai.js (AI 填充)
 */

let customGaps = [];
let selectedGapType = 'ai_fill';

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
                    </div>
                `;
            } else if (item.type === 'gap') {
                const gapType = item.gapType || 'ai_fill';
                const gapInfo = gapTypes[gapType] || gapTypes.ai_fill;
                const aiState = item.aiState || (gapType === 'ai_fill' ? 'ai-loading' : '');
                return `
                    <div class="timeline-item gap-item gap-${gapType} ${aiState}" data-index="${index}" data-gap-id="${item.gapId || ''}" style="border-left: 3px solid ${gapInfo.color}">
                        <span class="item-label"><i data-lucide="${gapInfo.icon}"></i> ${item.duration}s</span>
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
    
    const gapItem = { 
        type: 'gap', 
        duration: duration, 
        gapType: gapType,
        gapId: generateGapId()
    };
    
    state.timeline.push(gapItem);
    renderTimeline();
    
    if (gapType === 'ai_fill') {
        setTimeout(() => checkAndStartAiFillTasks(), 100);
    }
    
    closeCustomGapModal();
};

function renderGapBlocks() {
    const container = document.getElementById('gapBlocks');
    if (!container) return;
    
    const allGaps = [...gapPresets, ...customGaps].sort((a, b) => a - b);
    
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
