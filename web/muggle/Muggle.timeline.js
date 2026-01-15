/**
 * Muggle.timeline.js - 时间线渲染核心
 * BigEyeMix 麻瓜模式
 * 
 * 依赖文件:
 * - Muggle.timeline.drag.js (拖拽处理)
 * - Muggle.timeline.preview.js (预览波形)
 * - Muggle.timeline.magic.js (魔法填充)
 */

let customTransitions = [];  // { duration, type }
let selectedTransitionType = 'magicfill';

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
            } else if (item.type === 'transition') {
                const transType = item.transitionType || 'magicfill';
                const transInfo = transitionTypes[transType] || transitionTypes.magicfill;
                const magicState = item.magicState || (transType === 'magicfill' ? 'magic-loading' : '');
                return `
                    <div class="timeline-item transition-item transition-${transType} ${magicState}" data-index="${index}" data-transition-id="${item.transitionId || ''}" style="border-left: 3px solid ${transInfo.color}">
                        <span class="item-label"><i data-lucide="${transInfo.icon}"></i> ${item.duration}s</span>
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
        } else if (item.type === 'transition') {
            total += item.duration;
        }
    });
    
    document.getElementById('totalDuration').textContent = formatTime(total);
}

// ==================== 自定义过渡 ====================

window.showCustomTransitionModal = function() {
    document.getElementById('customTransitionModal').classList.add('show');
    document.getElementById('customTransitionInput').focus();
    refreshIcons();
};

window.closeCustomTransitionModal = function() {
    document.getElementById('customTransitionModal').classList.remove('show');
};

window.addCustomTransition = function() {
    const input = document.getElementById('customTransitionInput');
    const duration = parseInt(input.value);
    const transType = getSelectedTransitionType();
    
    if (isNaN(duration) || duration < 1 || duration > 30) {
        alert('请输入 1 ~ 30 秒之间的数值');
        return;
    }
    
    // 添加自定义过渡块（允许重复时长，因为可能是不同类型）
    customTransitions.push({ duration, type: transType });
    renderTransitionBlocks();
    
    closeCustomTransitionModal();
};

function renderTransitionBlocks() {
    const container = document.getElementById('transitionBlocks');
    if (!container) return;
    
    const presets = typeof transitionPresets !== 'undefined' ? transitionPresets : [1, 3, 5, 10];
    
    // 预设块（默认魔法填充）
    let html = presets.map(sec => `
        <div class="block transition-block" draggable="true" data-type="transition" data-duration="${sec}" data-transition-type="magicfill">
            <i data-lucide="sparkles"></i> ${sec}s
        </div>
    `).join('');
    
    // 自定义块（带类型）
    html += customTransitions.map((item, idx) => {
        const info = transitionTypes[item.type] || transitionTypes.magicfill;
        return `
            <div class="block transition-block transition-block-${item.type}" draggable="true" data-type="transition" data-duration="${item.duration}" data-transition-type="${item.type}">
                <i data-lucide="${info.icon}"></i> ${item.duration}s
            </div>
        `;
    }).join('');
    
    // 添加按钮
    html += `
        <div class="block transition-add-btn" onclick="showCustomTransitionModal()">
            <i data-lucide="plus"></i>
        </div>
    `;
    
    container.innerHTML = html;
    refreshIcons();
    initDragAndDrop();
}
