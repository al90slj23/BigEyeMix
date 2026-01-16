/**
 * Muggle.voice.js - 语音输入功能
 * BigEyeMix 麻瓜模式
 */

// 语音录制状态
const voiceState = {
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    stream: null
};

// 初始化语音输入功能
function initVoiceInput() {
    const voiceBtn = document.getElementById('voiceInputBtn');
    if (!voiceBtn) return;
    
    voiceBtn.addEventListener('click', toggleVoiceRecording);
}

// 切换录音状态
async function toggleVoiceRecording() {
    if (voiceState.isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

// 开始录音
async function startRecording() {
    const voiceBtn = document.getElementById('voiceInputBtn');
    const input = document.getElementById('muggleSpliceInput');
    
    try {
        // 检查浏览器支持
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('您的浏览器不支持录音功能');
            return;
        }
        
        // 请求麦克风权限
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                channelCount: 1,
                sampleRate: 16000,
                echoCancellation: true,
                noiseSuppression: true
            } 
        });
        
        voiceState.stream = stream;
        voiceState.audioChunks = [];
        
        // 创建 MediaRecorder
        const options = { mimeType: 'audio/webm' };
        
        // 尝试不同的 MIME 类型
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'audio/ogg';
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'audio/mp4';
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    options.mimeType = '';
                }
            }
        }
        
        const mediaRecorder = new MediaRecorder(stream, options);
        voiceState.mediaRecorder = mediaRecorder;
        
        // 收集音频数据
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                voiceState.audioChunks.push(event.data);
            }
        };
        
        // 录音结束处理
        mediaRecorder.onstop = async () => {
            await processRecording();
        };
        
        // 开始录音
        mediaRecorder.start();
        voiceState.isRecording = true;
        
        // 更新UI
        voiceBtn.classList.add('recording');
        voiceBtn.innerHTML = '<i data-lucide="mic-off"></i> 停止录音';
        refreshIcons();
        
        // 显示录音提示
        if (input) {
            input.placeholder = '正在录音...';
        }
        
        console.log('[Voice] 开始录音');
        
    } catch (error) {
        console.error('[Voice] 录音失败:', error);
        
        if (error.name === 'NotAllowedError') {
            alert('请允许使用麦克风权限');
        } else if (error.name === 'NotFoundError') {
            alert('未找到麦克风设备');
        } else {
            alert('录音失败: ' + error.message);
        }
        
        resetVoiceState();
    }
}

// 停止录音
function stopRecording() {
    const voiceBtn = document.getElementById('voiceInputBtn');
    const input = document.getElementById('muggleSpliceInput');
    
    if (voiceState.mediaRecorder && voiceState.isRecording) {
        voiceState.mediaRecorder.stop();
        voiceState.isRecording = false;
        
        // 停止音频流
        if (voiceState.stream) {
            voiceState.stream.getTracks().forEach(track => track.stop());
        }
        
        // 更新UI
        voiceBtn.classList.remove('recording');
        voiceBtn.innerHTML = '<i data-lucide="mic"></i>';
        voiceBtn.disabled = true;
        refreshIcons();
        
        if (input) {
            input.placeholder = '正在识别...';
        }
        
        console.log('[Voice] 停止录音');
    }
}

// 处理录音数据
async function processRecording() {
    const voiceBtn = document.getElementById('voiceInputBtn');
    const input = document.getElementById('muggleSpliceInput');
    
    try {
        // 合并音频数据
        const audioBlob = new Blob(voiceState.audioChunks, { 
            type: voiceState.mediaRecorder.mimeType || 'audio/webm' 
        });
        
        console.log('[Voice] 音频大小:', (audioBlob.size / 1024).toFixed(2), 'KB');
        
        // 检查音频大小
        if (audioBlob.size < 1000) {
            alert('录音时间太短，请重新录制');
            resetVoiceState();
            return;
        }
        
        if (audioBlob.size > 5 * 1024 * 1024) {
            alert('录音文件过大（超过5MB），请缩短录音时间');
            resetVoiceState();
            return;
        }
        
        // 发送到后端识别
        await recognizeSpeech(audioBlob);
        
    } catch (error) {
        console.error('[Voice] 处理录音失败:', error);
        alert('处理录音失败: ' + error.message);
        resetVoiceState();
    }
}

// 调用后端语音识别
async function recognizeSpeech(audioBlob) {
    const voiceBtn = document.getElementById('voiceInputBtn');
    const input = document.getElementById('muggleSpliceInput');
    
    try {
        // 构建 FormData
        const formData = new FormData();
        
        // 根据 MIME 类型确定文件扩展名
        let extension = 'webm';
        if (audioBlob.type.includes('ogg')) {
            extension = 'ogg';
        } else if (audioBlob.type.includes('mp4')) {
            extension = 'm4a';
        }
        
        formData.append('audio', audioBlob, `recording.${extension}`);
        
        console.log('[Voice] 发送识别请求...');
        
        // 发送请求
        const response = await fetch('/api/asr/recognize', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '识别失败');
        }
        
        const result = await response.json();
        
        if (result.success && result.text) {
            // 将识别结果填入输入框
            if (input) {
                input.value = result.text;
                input.focus();
            }
            
            console.log('[Voice] 识别成功:', result.text);
            
            // 显示成功提示
            showVoiceToast('识别成功！', 'success');
        } else {
            throw new Error(result.error || '识别失败');
        }
        
    } catch (error) {
        console.error('[Voice] 识别失败:', error);
        alert('语音识别失败: ' + error.message);
    } finally {
        resetVoiceState();
    }
}

// 重置语音状态
function resetVoiceState() {
    const voiceBtn = document.getElementById('voiceInputBtn');
    const input = document.getElementById('muggleSpliceInput');
    
    voiceState.isRecording = false;
    voiceState.mediaRecorder = null;
    voiceState.audioChunks = [];
    
    if (voiceState.stream) {
        voiceState.stream.getTracks().forEach(track => track.stop());
        voiceState.stream = null;
    }
    
    if (voiceBtn) {
        voiceBtn.classList.remove('recording');
        voiceBtn.innerHTML = '<i data-lucide="mic"></i>';
        voiceBtn.disabled = false;
        refreshIcons();
    }
    
    if (input) {
        input.placeholder = '描述你想要的拼接效果，例如："知我 1分56到2分34 不要，剩下的加上春颂"';
    }
}

// 显示提示消息
function showVoiceToast(message, type = 'info') {
    // 创建提示元素
    const toast = document.createElement('div');
    toast.className = `voice-toast voice-toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // 显示动画
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // 3秒后移除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// 导出函数
window.initVoiceInput = initVoiceInput;
