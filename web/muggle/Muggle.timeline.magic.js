/**
 * Muggle.timeline.magic.js - 魔法填充管理
 * BigEyeMix 麻瓜模式
 */

// 魔法填充任务队列
const magicFillTasks = new Map();

// 生成唯一的过渡 ID
function generateTransitionId() {
    return 'trans_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 日志函数
function magicLog(msg, type = '') {
    const logsEl = document.getElementById('magicStatusLogs');
    const boxEl = document.getElementById('magicStatusBox');
    if (!logsEl || !boxEl) return;
    
    boxEl.style.display = 'block';
    
    const now = new Date();
    const time = now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    logItem.innerHTML = `<span class="log-time">${time}</span><span class="log-msg ${type}">${msg}</span>`;
    logsEl.appendChild(logItem);
    logsEl.scrollTop = logsEl.scrollHeight;
}

// 更新状态徽章
function updateMagicBadge(status) {
    const badge = document.getElementById('magicStatusBadge');
    if (!badge) return;
    
    badge.className = 'magic-status-badge';
    switch (status) {
        case 'processing':
            badge.textContent = '生成中...';
            badge.classList.add('processing');
            break;
        case 'completed':
            badge.textContent = '已完成';
            badge.classList.add('completed');
            break;
        case 'failed':
            badge.textContent = '失败';
            badge.classList.add('failed');
            break;
        default:
            badge.textContent = '等待中';
    }
}

// 为新添加的魔法填充过渡启动生成任务
async function startMagicFillGeneration(transItem, prevClipInfo) {
    if (!transItem.transitionId) {
        transItem.transitionId = generateTransitionId();
    }
    
    const transId = transItem.transitionId;
    
    if (magicFillTasks.has(transId)) {
        const task = magicFillTasks.get(transId);
        if (task.status === 'completed' || task.status === 'processing') {
            return;
        }
    }
    
    magicLog(`开始生成 ${transItem.duration}s 过渡音频...`, 'info');
    updateMagicBadge('processing');
    
    magicFillTasks.set(transId, { status: 'processing', outputId: null, error: null });
    transItem.magicState = 'magic-loading';
    updateTransitionItemUI(transId, 'magic-loading');
    
    try {
        magicLog(`截取源音频 ${prevClipInfo.end - 10}s ~ ${prevClipInfo.end}s`);
        magicLog(`调用 PiAPI ACE-Step 扩展 ${transItem.duration}s...`);
        
        const response = await axios.post(API_BASE + '/api/magic/fill', {
            audio_file_id: prevClipInfo.fileId,
            audio_start: Math.max(0, prevClipInfo.end - 10),
            audio_end: prevClipInfo.end,
            extend_duration: transItem.duration,
            style_prompt: 'smooth transition, same style'
        });
        
        if (response.data.success) {
            magicFillTasks.set(transId, { 
                status: 'completed', 
                outputId: response.data.output_id,
                error: null 
            });
            transItem.magicState = 'magic-complete';
            transItem.magicOutputId = response.data.output_id;
            updateTransitionItemUI(transId, 'magic-complete');
            
            magicLog(`✓ 生成完成: ${response.data.output_id}`, 'success');
            updateMagicBadge('completed');
            updatePreviewWaveform();
        } else {
            throw new Error(response.data.message || 'Magic fill failed');
        }
    } catch (error) {
        console.error('[MagicFill] Generation failed:', error);
        magicFillTasks.set(transId, { 
            status: 'failed', 
            outputId: null, 
            error: error.message 
        });
        transItem.magicState = 'magic-failed';
        updateTransitionItemUI(transId, 'magic-failed');
        
        magicLog(`✗ 生成失败: ${error.message}`, 'error');
        updateMagicBadge('failed');
    }
}

// 更新过渡项目的 UI 状态
function updateTransitionItemUI(transId, magicState) {
    const transEl = document.querySelector(`.timeline-item[data-transition-id="${transId}"]`);
    if (transEl) {
        transEl.classList.remove('magic-loading', 'magic-complete', 'magic-failed');
        if (magicState) {
            transEl.classList.add(magicState);
        }
        
        if (magicState === 'magic-complete') {
            triggerFireworkEffect(transEl);
        }
    }
    
    updatePreviewSegmentState(transId, magicState);
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
function updatePreviewSegmentState(transId, magicState) {
    const timelineIndex = state.timeline.findIndex(item => item.transitionId === transId);
    if (timelineIndex === -1) return;
    
    // previewSegments 在 Muggle.timeline.preview.js 中定义
    if (typeof previewSegments !== 'undefined') {
        const segIndex = previewSegments.findIndex(seg => seg.index === timelineIndex);
        if (segIndex !== -1) {
            previewSegments[segIndex].magicState = magicState;
        }
    }
    
    // 直接更新预览波形而不是调用不存在的函数
    if (typeof updatePreviewWaveform === 'function') {
        updatePreviewWaveform();
    }
}

// 检查时间线中的魔法填充过渡并启动生成
function checkAndStartMagicFillTasks() {
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
        } else if (item.type === 'transition' && item.transitionType === 'magicfill') {
            if (prevClipInfo && !item.magicState) {
                if (!item.transitionId) {
                    item.transitionId = generateTransitionId();
                }
                startMagicFillGeneration(item, prevClipInfo);
            }
        }
    });
}

window.onTransitionAdded = function(transItem) {
    if (transItem.transitionType === 'magicfill') {
        setTimeout(() => {
            checkAndStartMagicFillTasks();
        }, 100);
    }
};
