/**
 * Muggle.logic.js - 主逻辑入口
 * BigEyeMix 麻瓜模式
 * 
 * 依赖文件（按顺序加载）：
 * - Muggle.config.js  - 配置与状态
 * - Muggle.utils.js   - 工具函数
 * - Muggle.upload.js  - 上传功能
 * - Muggle.history.js - 历史文件
 * - Muggle.editor.js  - 波形编辑器
 * - Muggle.timeline.js - 时间线组合
 * - Muggle.logic.js   - 主逻辑（本文件）
 */

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', () => {
    initUploadSection();
    initTransitionTypeSelector();
    loadHistoryFiles();
});

// ==================== 过渡类型选择 ====================

function initTransitionTypeSelector() {
    document.querySelectorAll('.transition-type-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.transition-type-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
        });
    });
}

function getSelectedTransitionType() {
    const selected = document.querySelector('.transition-type-option.selected');
    return selected ? selected.dataset.type : 'magicfill';
}

// ==================== 导航控制 ====================

window.nextStep = function() {
    if (state.currentStep < state.totalSteps) {
        state.currentStep++;
        updateStep();
        
        if (state.currentStep === 2) {
            renderEditorAndTimeline();
        } else if (state.currentStep === 3) {
            startMixing();
        }
    }
};

window.prevStep = function() {
    if (state.currentStep > 1) {
        state.currentStep--;
        updateStep();
        
        if (state.currentStep === 2) {
            renderEditorAndTimeline();
        }
    }
};

function updateStep() {
    document.querySelectorAll('.progress-step').forEach((step, index) => {
        step.classList.toggle('active', index < state.currentStep);
    });
    
    document.querySelectorAll('.step-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelector(`.step-content[data-step="${state.currentStep}"]`).classList.add('active');
    
    // 第二步使用 editor-mode 样式（透明背景，子元素各自有白色块）
    const contentCard = document.querySelector('.content-card');
    contentCard.classList.toggle('editor-mode', state.currentStep === 2);
    
    const stepTitles = {
        1: { title: '上传音频', desc: '选择要混合的音频文件' },
        2: { title: '剪辑组合', desc: '定义片段并拖拽组合' },
        3: { title: '生成混音', desc: '正在处理你的音乐' }
    };
    
    document.getElementById('stepNumber').textContent = `${state.currentStep}/${state.totalSteps}`;
    document.getElementById('stepTitle').textContent = stepTitles[state.currentStep].title;
    document.getElementById('stepDesc').textContent = stepTitles[state.currentStep].desc;
    
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const buttonGroup = document.getElementById('buttonGroup');
    
    prevBtn.style.display = state.currentStep === 1 ? 'none' : 'flex';
    buttonGroup.style.display = state.currentStep === 3 ? 'none' : 'flex';
    
    if (state.currentStep === 2) {
        nextBtn.innerHTML = '<i data-lucide="music"></i> 开始混音';
    } else {
        nextBtn.innerHTML = '下一步 <i data-lucide="arrow-right"></i>';
    }
    
    refreshIcons();
    updateNextButton();
}

function updateNextButton() {
    const nextBtn = document.getElementById('nextBtn');
    let canProceed = false;
    
    switch (state.currentStep) {
        case 1:
            canProceed = state.tracks.filter(t => t.uploaded).length >= 1;
            break;
        case 2:
            canProceed = state.timeline.length > 0;
            break;
        default:
            canProceed = true;
    }
    
    nextBtn.disabled = !canProceed;
}

// ==================== 混音处理 ====================

async function startMixing() {
    try {
        const segments = [];
        
        state.timeline.forEach(item => {
            if (item.type === 'clip') {
                const track = state.tracks.find(t => t.id === item.trackId);
                if (track && track.uploaded) {
                    const clip = track.clips.find(c => c.id === item.clipId);
                    if (clip) {
                        segments.push({
                            file_id: track.uploaded.file_id,
                            start: clip.start,
                            end: clip.end
                        });
                    }
                }
            } else if (item.type === 'transition') {
                segments.push({
                    file_id: '__transition__',
                    start: 0,
                    end: item.duration,
                    transition_type: item.transitionType || 'magicfill'
                });
            }
        });
        
        const response = await axios.post(API_BASE + '/api/mix/multi', {
            segments: segments,
            transition_duration: 0,
            transition_type: 'cut'
        });
        
        document.getElementById('processingView').style.display = 'none';
        document.getElementById('resultView').style.display = 'block';
        
        document.getElementById('downloadBtn').onclick = () => {
            window.location.href = API_BASE + `/api/download/${response.data.output_id}`;
        };
        
        refreshIcons();
        
    } catch (error) {
        alert('混音失败：' + (error.response?.data?.detail || error.message));
        state.currentStep = 2;
        updateStep();
    }
}
