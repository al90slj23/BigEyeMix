/**
 * Muggle.upload.js - 上传功能模块
 * BigEyeMix 麻瓜模式
 */

function initUploadSection() {
    addUploadSlot();
    addUploadSlot();
    
    document.getElementById('addUploadBtn').addEventListener('click', () => {
        addUploadSlot();
    });
}

function addUploadSlot() {
    const index = state.tracks.length;
    const label = trackLabels[index];
    const color = trackColors[index % trackColors.length];
    
    state.tracks.push({
        id: index,
        label: label,
        color: color,
        file: null,
        uploaded: null,
        info: null,
        wavesurfer: null,
        clips: []
    });
    
    renderUploadList();
}

function renderUploadList() {
    const container = document.getElementById('uploadList');
    container.innerHTML = state.tracks.map((track, index) => `
        <div class="upload-item ${track.uploaded ? 'has-file' : ''} ${track.uploading ? 'uploading' : ''}" data-index="${index}">
            <div class="icon">
                ${track.uploading ? `
                    <div class="upload-spinner"></div>
                ` : `
                    <i data-lucide="${track.uploaded ? 'file-audio' : 'music'}"></i>
                `}
            </div>
            <div class="info">
                <div class="label">音频 ${track.label}</div>
                <div class="meta">
                    ${track.uploading ? `
                        <span class="upload-status">${track.progress !== null ? `上传中 ${track.progress}%` : '加载中...'}</span>
                        ${track.progress !== null ? `
                            <div class="progress-bar-mini">
                                <div class="progress-fill" style="width: ${track.progress}%"></div>
                            </div>
                        ` : `
                            <div class="progress-bar-mini">
                                <div class="progress-fill indeterminate"></div>
                            </div>
                        `}
                    ` : track.uploaded ? track.file.name : '点击上传或选择历史文件'}
                </div>
            </div>
            ${track.uploaded ? `
                <button class="remove-btn" onclick="event.stopPropagation(); removeTrack(${index})">
                    <i data-lucide="x"></i>
                </button>
            ` : !track.uploading ? `
                <button class="history-btn-small" onclick="event.stopPropagation(); showHistoryModal(${index})" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <i data-lucide="history" style="width:16px;height:16px;color:#667eea;"></i>
                </button>
            ` : ''}
        </div>
        <input type="file" id="fileInput${index}" accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg" style="display:none">
    `).join('');
    
    state.tracks.forEach((track, index) => {
        const item = container.querySelector(`[data-index="${index}"]`);
        const fileInput = document.getElementById(`fileInput${index}`);
        
        item.addEventListener('click', () => {
            if (!track.uploaded && !track.uploading) {
                fileInput.click();
            }
        });
        
        fileInput.addEventListener('change', (e) => handleFileSelect(e, index));
    });
    
    refreshIcons();
    updateNextButton();
}

async function handleFileSelect(event, index) {
    const file = event.target.files[0];
    if (!file) return;
    
    const track = state.tracks[index];
    track.file = file;
    track.uploading = true;
    track.progress = 0;
    
    renderUploadList();
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await axios.post(API_BASE + '/api/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                track.progress = percent;
                const progressFill = document.querySelector(`[data-index="${index}"] .progress-fill`);
                const statusText = document.querySelector(`[data-index="${index}"] .upload-status`);
                if (progressFill) progressFill.style.width = percent + '%';
                if (statusText) statusText.textContent = `上传中 ${percent}%`;
            }
        });
        
        track.uploaded = response.data;
        track.info = response.data.info;
        track.uploading = false;
        track.clips = [{ id: 1, start: 0, end: track.info.duration }];
        
        renderUploadList();
    } catch (error) {
        track.uploading = false;
        track.file = null;
        renderUploadList();
        alert('上传失败：' + (error.response?.data?.detail || error.message));
    }
}

window.removeTrack = function(index) {
    const track = state.tracks[index];
    
    if (state.tracks.length > 2) {
        state.tracks.splice(index, 1);
        state.tracks.forEach((t, i) => {
            t.id = i;
            t.label = trackLabels[i];
            t.color = trackColors[i % trackColors.length];
        });
    } else {
        track.file = null;
        track.uploaded = null;
        track.info = null;
        track.clips = [];
    }
    
    renderUploadList();
};
