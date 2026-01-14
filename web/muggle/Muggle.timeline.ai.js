/**
 * Muggle.timeline.ai.js - AI 填充管理
 * BigEyeMix 麻瓜模式
 */

// AI 填充任务队列
const aiFillTasks = new Map();

// 生成唯一的 gap ID
function generateGapId() {
    return 'gap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 为新添加的 AI 填充间隔启动生成任务
async function startAiFillGeneration(gapItem, prevClipInfo) {
    if (!gapItem.gapId) {
        gapItem.gapId = generateGapId();
    }
    
    const gapId = gapItem.gapId;
    
    if (aiFillTasks.has(gapId)) {
        const task = aiFillTasks.get(gapId);
        if (task.status === 'completed' || task.status === 'processing') {
            return;
        }
    }
    
    aiFillTasks.set(gapId, { status: 'processing', outputId: null, error: null });
    gapItem.aiState = 'ai-loading';
    updateGapItemUI(gapId, 'ai-loading');
    
    try {
        const response = await axios.post(API_BASE + '/api/ai/fill', {
            audio_file_id: prevClipInfo.fileId,
            audio_start: Math.max(0, prevClipInfo.end - 10),
            audio_end: prevClipInfo.end,
            extend_duration: gapItem.duration,
            style_prompt: 'smooth transition, same style'
        });
        
        if (response.data.success) {
            aiFillTasks.set(gapId, { 
                status: 'completed', 
                outputId: response.data.output_id,
                error: null 
            });
            gapItem.aiState = 'ai-complete';
            gapItem.aiOutputId = response.data.output_id;
            updateGapItemUI(gapId, 'ai-complete');
            
            updatePreviewWaveform();
        } else {
            throw new Error(response.data.message || 'AI fill failed');
        }
    } catch (error) {
        console.error('AI fill generation failed:', error);
        aiFillTasks.set(gapId, { 
            status: 'failed', 
            outputId: null, 
            error: error.message 
        });
        gapItem.aiState = '';
        updateGapItemUI(gapId, '');
    }
}

// 更新 gap 项目的 UI 状态
function updateGapItemUI(gapId, aiState) {
    const gapEl = document.querySelector(`.timeline-item[data-gap-id="${gapId}"]`);
    if (gapEl) {
        gapEl.classList.remove('ai-loading', 'ai-complete');
        if (aiState) {
            gapEl.classList.add(aiState);
        }
        
        if (aiState === 'ai-complete') {
            triggerFireworkEffect(gapEl);
        }
    }
    
    updatePreviewSegmentState(gapId, aiState);
}

// 烟花特效
function triggerFireworkEffect(element) {
    const container = document.createElement('div');
    container.className = 'firework-container';
    element.appendChild(container);
    
    const colors = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#8b00ff', '#f093fb', '#f5576c'];
    const stars = ['✨', '⭐', '🌟', '💫', '✦', '★'];
    
    for (let i = 0; i < 12; i++) {
        const firework = document.createElement('div');
        firework.className = 'firework';
        firework.style.background = colors[Math.floor(Math.random() * colors.length)];
        firework.style.left = (30 + Math.random() * 40) + '%';
        firework.style.top = (30 + Math.random() * 40) + '%';
        firework.style.animationDelay = (Math.random() * 0.3) + 's';
        container.appendChild(firework);
    }
    
    for (let i = 0; i < 6; i++) {
        const star = document.createElement('div');
        star.className = 'sparkle-star';
        star.textContent = stars[Math.floor(Math.random() * stars.length)];
        star.style.left = (10 + Math.random() * 80) + '%';
        star.style.top = (10 + Math.random() * 80) + '%';
        star.style.animationDelay = (Math.random() * 0.4) + 's';
        container.appendChild(star);
    }
    
    setTimeout(() => {
        container.remove();
    }, 1200);
}

// 更新预览颜色条中特定段的状态
function updatePreviewSegmentState(gapId, aiState) {
    const timelineIndex = state.timeline.findIndex(item => item.gapId === gapId);
    if (timelineIndex === -1) return;
    
    const segIndex = previewSegments.findIndex(seg => seg.index === timelineIndex);
    if (segIndex !== -1) {
        previewSegments[segIndex].aiState = aiState;
    }
    
    renderPreviewSegments();
}

// 检查时间线中的 AI 填充间隔并启动生成
function checkAndStartAiFillTasks() {
    let prevClipInfo = null;
    
    state.timeline.forEach((item, index) => {
        if (item.type === 'clip') {
            const track = state.tracks.find(t => t.id === item.trackId);
            if (track && track.uploaded) {
                const clip = track.clips.find(c => c.id === item.clipId);
                if (clip) {
                    prevClipInfo = {
                        fileId: track.uploaded.file_id,
                        start: clip.start,
                        end: clip.end
                    };
                }
            }
        } else if (item.type === 'gap' && item.gapType === 'ai_fill') {
            if (prevClipInfo && !item.aiState) {
                if (!item.gapId) {
                    item.gapId = generateGapId();
                }
                startAiFillGeneration(item, prevClipInfo);
            }
        }
    });
}

window.onGapAdded = function(gapItem) {
    if (gapItem.gapType === 'ai_fill') {
        setTimeout(() => {
            checkAndStartAiFillTasks();
        }, 100);
    }
};
