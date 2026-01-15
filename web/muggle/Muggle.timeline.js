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
let selectedTransitionType = 'crossfade';

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
        
        // 检查并更新不完整的过渡块
        updateIncompleteTransitions();
        
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
                
                // 确定处理状态
                let magicState = item.magicState || '';
                
                // 对于 crossfade 和 beatsync，始终标记为 processing（因为需要真正的音频处理）
                if ((transType === 'crossfade' || transType === 'beatsync') && !magicState) {
                    // 检查是否有完整的前后数据
                    if (item.transitionData && item.transitionData.nextFileId) {
                        // 有完整数据，但仍需要处理（目前是占位实现）
                        magicState = 'processing';
                    } else {
                        // 没有完整数据，等待后续片段
                        magicState = 'processing';
                    }
                }
                
                // 对于 magicfill，如果没有状态，默认为 loading
                if (transType === 'magicfill' && !magicState) {
                    magicState = 'magic-loading';
                }
                
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

// 检查并更新不完整的过渡块（当新片段添加到过渡块后面时）
function updateIncompleteTransitions() {
    for (let i = 0; i < state.timeline.length - 1; i++) {
        const item = state.timeline[i];
        const nextItem = state.timeline[i + 1];
        
        // 如果当前是过渡块，下一个是片段，且过渡块缺少 nextFileId
        if (item.type === 'transition' && nextItem.type === 'clip' &&
            (item.transitionType === 'crossfade' || item.transitionType === 'beatsync')) {
            
            if (!item.transitionData || !item.transitionData.nextFileId) {
                const halfDuration = item.duration / 2;
                const nextTrack = state.tracks.find(t => t.id === nextItem.trackId);
                
                if (nextTrack) {
                    const nextClip = nextTrack.clips.find(c => c.id === nextItem.clipId);
                    
                    if (nextClip) {
                        // 更新过渡数据
                        if (!item.transitionData) {
                            item.transitionData = {};
                        }
                        
                        item.transitionData.nextTrackId = nextItem.trackId;
                        item.transitionData.nextClipId = nextItem.clipId;
                        item.transitionData.nextFileId = nextTrack.uploaded.file_id;
                        item.transitionData.nextFadeStart = nextClip.start;
                        item.transitionData.nextFadeEnd = nextClip.start + halfDuration;
                        
                        // 清除 processing 状态
                        delete item.magicState;
                        
                        console.log(`[Transition] Updated ${item.transitionType} with next clip:`, item.transitionData);
                    }
                }
            }
        }
    }
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
            const transType = item.transitionType || 'magicfill';
            if (transType === 'magicfill' || transType === 'silence') {
                // 魔法填充和静音：增加时长
                total += item.duration;
            } else if (transType === 'crossfade' || transType === 'beatsync') {
                // 淡入淡出和节拍对齐：减少时长（因为是重叠的）
                // 只有当有完整的前后片段信息时才减少
                if (item.transitionData && item.transitionData.nextFileId) {
                    total -= item.duration;
                }
            }
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
