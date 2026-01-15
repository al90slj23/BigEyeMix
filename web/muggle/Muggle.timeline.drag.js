/**
 * Muggle.timeline.drag.js - 时间线拖拽处理
 * BigEyeMix 麻瓜模式
 */

let draggedData = null;
let draggedIndex = null;
let touchClone = null;
let lastInsertIndex = -1;

function initDragAndDrop() {
    // 片段块和过渡块
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
    } else if (type === 'transition') {
        return { 
            type: 'transition', 
            duration: parseFloat(el.dataset.duration),
            transitionType: el.dataset.transitionType || 'magicfill'
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
    
    const newItem = { ...draggedData };
    if (newItem.type === 'transition' && !newItem.transitionId) {
        newItem.transitionId = generateTransitionId();
    }
    
    // 处理淡入淡出和节拍对齐：需要读取前后片段信息
    if (newItem.type === 'transition' && 
        (newItem.transitionType === 'crossfade' || newItem.transitionType === 'beatsync')) {
        const insertIndex = state.timeline.length;
        const prevIndex = insertIndex - 1;
        
        if (prevIndex >= 0) {
            const prevItem = state.timeline[prevIndex];
            
            // 只有当前一个是片段时才处理（后面的片段会在下次添加时处理）
            if (prevItem.type === 'clip') {
                const halfDuration = newItem.duration / 2;
                const prevTrack = state.tracks.find(t => t.id === prevItem.trackId);
                
                if (prevTrack) {
                    const prevClip = prevTrack.clips.find(c => c.id === prevItem.clipId);
                    
                    if (prevClip) {
                        // 存储前段信息
                        newItem.transitionData = {
                            prevTrackId: prevItem.trackId,
                            prevClipId: prevItem.clipId,
                            prevFileId: prevTrack.uploaded.file_id,
                            prevFadeStart: prevClip.end - halfDuration,
                            prevFadeEnd: prevClip.end,
                            halfDuration: halfDuration
                        };
                        
                        console.log(`[Transition] ${newItem.transitionType} prepared with prev clip:`, newItem.transitionData);
                    }
                }
            }
        }
    }
    
    state.timeline.push(newItem);
    renderTimeline();
    
    if (newItem.type === 'transition' && newItem.transitionType === 'magicfill' && !newItem.magicState) {
        setTimeout(() => checkAndStartMagicFillTasks(), 100);
    }
    
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
    if (!el || el.classList.contains('transition-add-btn')) return;
    
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
    touchClone.style.left = (touch.clientX - touchClone.offsetWidth/2) + 'px';
    touchClone.style.top = (touch.clientY - touchClone.offsetHeight/2) + 'px';
    
    const insertPos = findInsertPosition(touch.clientX, touch.clientY);
    updateInsertIndicator(touch.clientX, touch.clientY);
    
    if (draggedIndex !== null) {
        activateTrash();
        
        if (isOverTrash(touch.clientX, touch.clientY)) {
            hoverTrash(true);
            hideDeleteHint();
            touchClone.style.opacity = '0.5';
            touchClone.style.transform = 'scale(0.7) rotate(-10deg)';
        } else if (insertPos === null) {
            hoverTrash(false);
            showDeleteHint();
            touchClone.style.opacity = '0.5';
            touchClone.style.transform = 'scale(0.8)';
        } else {
            hoverTrash(false);
            hideDeleteHint();
            touchClone.style.opacity = '0.9';
            touchClone.style.transform = 'scale(1.1)';
        }
    }
}

function handleTouchEnd(e) {
    if (!draggedData) return;
    
    const touch = e.changedTouches[0];
    const insertPos = findInsertPosition(touch.clientX, touch.clientY);
    
    if (touchClone) { touchClone.remove(); touchClone = null; }
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    clearDropIndicators();
    hideDeleteHint();
    deactivateTrash();
    
    if (draggedIndex !== null) {
        if (isOverTrash(touch.clientX, touch.clientY) || insertPos === null) {
            const deleteIndex = draggedIndex;
            confirmDeleteItem(deleteIndex, touch.clientX, touch.clientY);
            draggedData = null;
            draggedIndex = null;
            lastInsertIndex = -1;
            return;
        }
    }
    
    if (insertPos !== null) {
        if (insertPos.index !== undefined) {
            insertAtPosition(insertPos.index, insertPos.before);
        } else {
            if (draggedIndex !== null) state.timeline.splice(draggedIndex, 1);
            
            const newItem = { ...draggedData };
            if (newItem.type === 'transition' && !newItem.transitionId) {
                newItem.transitionId = generateTransitionId();
            }
            
            // 处理淡入淡出和节拍对齐
            if (newItem.type === 'transition' && 
                (newItem.transitionType === 'crossfade' || newItem.transitionType === 'beatsync')) {
                const insertIndex = state.timeline.length;
                const prevIndex = insertIndex - 1;
                
                if (prevIndex >= 0) {
                    const prevItem = state.timeline[prevIndex];
                    
                    if (prevItem.type === 'clip') {
                        const halfDuration = newItem.duration / 2;
                        const prevTrack = state.tracks.find(t => t.id === prevItem.trackId);
                        
                        if (prevTrack) {
                            const prevClip = prevTrack.clips.find(c => c.id === prevItem.clipId);
                            
                            if (prevClip) {
                                newItem.transitionData = {
                                    prevTrackId: prevItem.trackId,
                                    prevClipId: prevItem.clipId,
                                    prevFileId: prevTrack.uploaded.file_id,
                                    prevFadeStart: prevClip.end - halfDuration,
                                    prevFadeEnd: prevClip.end,
                                    halfDuration: halfDuration
                                };
                                
                                console.log(`[Transition] ${newItem.transitionType} prepared with prev clip:`, newItem.transitionData);
                            }
                        }
                    }
                }
            }
            
            state.timeline.push(newItem);
            renderTimeline();
            
            if (newItem.type === 'transition' && newItem.transitionType === 'magicfill' && !newItem.magicState) {
                setTimeout(() => checkAndStartMagicFillTasks(), 100);
            }
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
        const left = i === 0 ? dropRect.left : rect.left - 4;
        const right = i === items.length - 1 ? dropRect.right : rect.right + 4;
        
        if (x >= left && x <= right && y >= rect.top - 10 && y <= rect.bottom + 10) {
            const midX = rect.left + rect.width / 2;
            return { index: i, before: x < midX };
        }
    }
    
    return { append: true };
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
    
    let newItem = null;
    
    if (draggedIndex !== null) {
        const item = state.timeline.splice(draggedIndex, 1)[0];
        let newIndex = targetIndex;
        if (draggedIndex < targetIndex) newIndex--;
        if (!insertBefore) newIndex++;
        state.timeline.splice(newIndex, 0, item);
        newItem = item;
    } else {
        const insertIndex = insertBefore ? targetIndex : targetIndex + 1;
        newItem = { ...draggedData };
        if (newItem.type === 'transition' && !newItem.transitionId) {
            newItem.transitionId = generateTransitionId();
        }
        
        // 处理淡入淡出和节拍对齐：需要修改前后片段
        if (newItem.type === 'transition' && 
            (newItem.transitionType === 'crossfade' || newItem.transitionType === 'beatsync')) {
            const prevIndex = insertIndex - 1;
            const nextIndex = insertIndex;
            
            if (prevIndex >= 0 && nextIndex < state.timeline.length) {
                const prevItem = state.timeline[prevIndex];
                const nextItem = state.timeline[nextIndex];
                
                // 只有当前后都是片段时才处理
                if (prevItem.type === 'clip' && nextItem.type === 'clip') {
                    const halfDuration = newItem.duration / 2;
                    
                    // 获取前后片段的轨道和片段信息
                    const prevTrack = state.tracks.find(t => t.id === prevItem.trackId);
                    const nextTrack = state.tracks.find(t => t.id === nextItem.trackId);
                    
                    if (prevTrack && nextTrack) {
                        const prevClip = prevTrack.clips.find(c => c.id === prevItem.clipId);
                        const nextClip = nextTrack.clips.find(c => c.id === nextItem.clipId);
                        
                        if (prevClip && nextClip) {
                            // 存储过渡信息到过渡块
                            newItem.transitionData = {
                                prevTrackId: prevItem.trackId,
                                prevClipId: prevItem.clipId,
                                prevFileId: prevTrack.uploaded.file_id,
                                prevFadeStart: prevClip.end - halfDuration,
                                prevFadeEnd: prevClip.end,
                                nextTrackId: nextItem.trackId,
                                nextClipId: nextItem.clipId,
                                nextFileId: nextTrack.uploaded.file_id,
                                nextFadeStart: nextClip.start,
                                nextFadeEnd: nextClip.start + halfDuration
                            };
                            
                            console.log(`[Transition] ${newItem.transitionType} between clips:`, newItem.transitionData);
                        }
                    }
                }
            }
        }
        
        state.timeline.splice(insertIndex, 0, newItem);
    }
    
    renderTimeline();
    
    if (newItem && newItem.type === 'transition' && newItem.transitionType === 'magicfill' && !newItem.magicState) {
        setTimeout(() => checkAndStartMagicFillTasks(), 100);
    }
    
    draggedData = null;
    draggedIndex = null;
}

// ==================== 删除提示和特效 ====================

let deleteHintEl = null;
let pendingDeleteCallback = null;

function showDeleteHint() {
    if (!deleteHintEl) {
        deleteHintEl = document.createElement('div');
        deleteHintEl.className = 'delete-hint';
        deleteHintEl.innerHTML = '<i data-lucide="trash-2"></i> 松手删除';
        document.body.appendChild(deleteHintEl);
        refreshIcons();
    }
    deleteHintEl.classList.add('show');
}

function hideDeleteHint() {
    if (deleteHintEl) {
        deleteHintEl.classList.remove('show');
    }
}

function showDeleteEffect(x, y) {
    const effect = document.createElement('div');
    effect.className = 'delete-effect';
    effect.innerHTML = '💨';
    effect.style.left = x + 'px';
    effect.style.top = y + 'px';
    document.body.appendChild(effect);
    setTimeout(() => effect.remove(), 600);
}

function activateTrash() {
    const trash = document.getElementById('timelineTrash');
    if (trash) trash.classList.add('active');
}

function deactivateTrash() {
    const trash = document.getElementById('timelineTrash');
    if (trash) trash.classList.remove('active', 'hover');
}

function hoverTrash(isHover) {
    const trash = document.getElementById('timelineTrash');
    if (trash) {
        if (isHover) trash.classList.add('hover');
        else trash.classList.remove('hover');
    }
}

function isOverTrash(x, y) {
    const trash = document.getElementById('timelineTrash');
    if (!trash) return false;
    const rect = trash.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function showConfirmDelete(title, desc, onConfirm) {
    const modal = document.getElementById('confirmDeleteModal');
    const titleEl = document.getElementById('confirmDeleteTitle');
    const descEl = document.getElementById('confirmDeleteDesc');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    
    titleEl.textContent = title || '确认删除？';
    descEl.textContent = desc || '此操作无法撤销';
    
    pendingDeleteCallback = onConfirm;
    
    confirmBtn.onclick = () => {
        if (pendingDeleteCallback) {
            pendingDeleteCallback();
            pendingDeleteCallback = null;
        }
        closeConfirmDelete();
    };
    
    modal.classList.add('show');
    refreshIcons();
}

window.closeConfirmDelete = function() {
    const modal = document.getElementById('confirmDeleteModal');
    modal.classList.remove('show');
    pendingDeleteCallback = null;
};

window.confirmClearTimeline = function() {
    if (state.timeline.length === 0) return;
    
    showConfirmDelete(
        '清空时间线？',
        `将删除 ${state.timeline.length} 个块`,
        () => {
            state.timeline = [];
            renderTimeline();
            showDeleteEffect(window.innerWidth / 2, window.innerHeight / 2);
        }
    );
};

function confirmDeleteItem(index, x, y) {
    const item = state.timeline[index];
    if (!item) return;
    
    let itemName = '';
    if (item.type === 'clip') {
        const track = state.tracks.find(t => t.id === item.trackId);
        itemName = track ? `${track.label}${item.clipId}` : '片段';
    } else {
        itemName = `${item.duration}s 处理`;
    }
    
    showConfirmDelete(
        `删除 ${itemName}？`,
        '从时间线移除此块',
        () => {
            state.timeline.splice(index, 1);
            renderTimeline();
            showDeleteEffect(x, y);
        }
    );
}
