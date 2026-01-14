// 状态管理
const state = {
    currentStep: 1,
    selectedScene: null,
    fileA: null,
    fileB: null,
    trackA: null,
    trackB: null,
    outputId: null
};

// 场景配置
const sceneConfigs = {
    'quick-fade': {
        name: '快速淡入淡出',
        transition: 3,
        description: '3秒平滑过渡'
    },
    'seamless': {
        name: '无缝衔接',
        transition: 1,
        description: '智能节拍匹配'
    },
    'dj-mix': {
        name: 'DJ 混音',
        transition: 8,
        description: '8秒专业过渡'
    },
    'custom': {
        name: '自定义',
        transition: 4,
        description: '自由设置参数'
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initSceneSelection();
    initFileUpload();
    initSlider();
});

// 场景选择
function initSceneSelection() {
    const sceneCards = document.querySelectorAll('.scene-card');
    sceneCards.forEach(card => {
        card.addEventListener('click', () => {
            sceneCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            state.selectedScene = card.dataset.scene;
            updateNextButton();
        });
    });
}

// 文件上传
function initFileUpload() {
    const fileA = document.getElementById('fileA');
    const fileB = document.getElementById('fileB');

    fileA.addEventListener('change', (e) => handleFileSelect(e, 'A'));
    fileB.addEventListener('change', (e) => handleFileSelect(e, 'B'));
}

async function handleFileSelect(event, track) {
    const file = event.target.files[0];
    if (!file) return;

    state[`file${track}`] = file;

    // 更新 UI
    const uploadBox = document.getElementById(`uploadBox${track}`);
    const fileInfo = document.getElementById(`fileInfo${track}`);
    const fileName = document.getElementById(`fileName${track}`);
    const fileMeta = document.getElementById(`fileMeta${track}`);

    uploadBox.classList.add('has-file');
    fileInfo.classList.add('show');
    fileName.textContent = file.name;
    fileMeta.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;

    // 上传到服务器
    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await axios.post('/api/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        state[`track${track}`] = response.data;
        fileMeta.textContent += ` · ${response.data.info.duration.toFixed(1)}秒`;
        
        updateNextButton();
    } catch (error) {
        alert('上传失败：' + (error.response?.data?.detail || error.message));
    }
}

// 滑块
function initSlider() {
    const slider = document.getElementById('transitionSlider');
    const value = document.getElementById('transitionValue');
    
    slider.addEventListener('input', (e) => {
        value.textContent = e.target.value;
        updateTotalDuration();
    });
}

// 更新总时长
function updateTotalDuration() {
    if (!state.trackA || !state.trackB) return;
    
    const transition = parseFloat(document.getElementById('transitionSlider').value);
    const durationA = state.trackA.info.duration;
    const durationB = state.trackB.info.duration;
    const total = durationA + durationB - transition;
    
    document.getElementById('totalDuration').textContent = total.toFixed(1);
}

// 步骤控制
window.nextStep = function() {
    if (state.currentStep < 4) {
        state.currentStep++;
        updateStep();
    } else if (state.currentStep === 4) {
        startMixing();
    }
};

window.prevStep = function() {
    if (state.currentStep > 1) {
        state.currentStep--;
        updateStep();
    }
};

function updateStep() {
    // 更新进度条
    document.querySelectorAll('.progress-step').forEach((step, index) => {
        if (index < state.currentStep) {
            step.classList.add('active');
        } else {
            step.classList.remove('active');
        }
    });

    // 更新步骤内容
    document.querySelectorAll('.step-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelector(`[data-step="${state.currentStep}"]`).classList.add('active');

    // 更新步骤指示器
    const stepTitles = {
        1: { title: '选择混音场景', desc: '告诉我们你想做什么' },
        2: { title: '上传音频文件', desc: '选择要混音的两首歌' },
        3: { title: '预览和调整', desc: '微调参数，预览效果' },
        4: { title: '生成混音', desc: '正在处理你的音乐' }
    };

    document.getElementById('stepNumber').textContent = `${state.currentStep}/4`;
    document.getElementById('stepTitle').textContent = stepTitles[state.currentStep].title;
    document.getElementById('stepDesc').textContent = stepTitles[state.currentStep].desc;

    // 更新按钮
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const buttonGroup = document.getElementById('buttonGroup');

    if (state.currentStep === 1) {
        prevBtn.style.display = 'none';
    } else {
        prevBtn.style.display = 'block';
    }

    if (state.currentStep === 4) {
        buttonGroup.style.display = 'none';
    } else {
        buttonGroup.style.display = 'flex';
    }

    // 步骤 3 特殊处理
    if (state.currentStep === 3) {
        updateTotalDuration();
        // 应用场景配置
        if (state.selectedScene && sceneConfigs[state.selectedScene]) {
            const config = sceneConfigs[state.selectedScene];
            document.getElementById('transitionSlider').value = config.transition;
            document.getElementById('transitionValue').textContent = config.transition;
            updateTotalDuration();
        }
    }

    updateNextButton();
}

function updateNextButton() {
    const nextBtn = document.getElementById('nextBtn');
    let canProceed = false;

    switch (state.currentStep) {
        case 1:
            canProceed = state.selectedScene !== null;
            break;
        case 2:
            canProceed = state.fileA !== null && state.fileB !== null;
            break;
        case 3:
            canProceed = true;
            nextBtn.textContent = '🎵 开始混音';
            break;
        default:
            canProceed = true;
    }

    nextBtn.disabled = !canProceed;
}

// 开始混音
async function startMixing() {
    try {
        const transition = parseFloat(document.getElementById('transitionSlider').value);

        const response = await axios.post('/api/mix', {
            track_a_id: state.trackA.file_id,
            track_b_id: state.trackB.file_id,
            track_a_start: 0,
            track_a_end: null,
            track_b_start: 0,
            track_b_end: null,
            target_duration: null,
            transition_duration: transition
        });

        state.outputId = response.data.output_id;

        // 显示结果
        document.getElementById('processingView').style.display = 'none';
        document.getElementById('resultView').style.display = 'block';

        // 设置下载按钮
        const downloadBtn = document.getElementById('downloadBtn');
        downloadBtn.onclick = () => {
            window.location.href = `/api/download/${state.outputId}`;
        };

    } catch (error) {
        alert('混音失败：' + (error.response?.data?.detail || error.message));
        state.currentStep = 3;
        updateStep();
    }
}
