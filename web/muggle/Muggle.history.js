/**
 * Muggle.history.js - 历史文件管理
 * BigEyeMix 麻瓜模式
 */

let historyFilesCache = null;
let currentHistoryIndex = null;

async function loadHistoryFiles() {
    try {
        const response = await axios.get(API_BASE + '/api/uploads');
        historyFilesCache = response.data.files || [];
    } catch (error) {
        console.log('Failed to load history files:', error);
    }
}

window.showHistoryModal = async function(index) {
    currentHistoryIndex = index;
    const modal = document.getElementById('historyModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = `选择音频 ${trackLabels[index]}`;
    modalBody.innerHTML = '<div class="modal-empty"><div class="spinner"></div><div>加载中...</div></div>';
    modal.classList.add('show');
    
    try {
        if (!historyFilesCache) {
            const response = await axios.get(API_BASE + '/api/uploads');
            historyFilesCache = response.data.files || [];
        }
        
        if (historyFilesCache.length === 0) {
            modalBody.innerHTML = '<div class="modal-empty"><i data-lucide="inbox"></i><div>暂无历史文件</div></div>';
        } else {
            modalBody.innerHTML = historyFilesCache.map(file => `
                <div class="history-file-item" onclick="selectHistoryFile('${file.file_id}', '${file.filename.replace(/'/g, "\\'")}', ${file.size})">
                    <i data-lucide="file-audio"></i>
                    <div class="history-file-info">
                        <div class="history-file-name">${file.filename}</div>
                        <div class="history-file-meta">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                </div>
            `).join('');
        }
        
        refreshIcons();
    } catch (error) {
        modalBody.innerHTML = '<div class="modal-empty"><i data-lucide="alert-circle"></i><div>加载失败</div></div>';
        refreshIcons();
    }
};

window.selectHistoryFile = async function(fileId, filename, size) {
    if (currentHistoryIndex === null) return;
    
    const track = state.tracks[currentHistoryIndex];
    
    closeHistoryModal();
    
    track.file = { name: filename, size: size };
    track.uploading = true;
    track.progress = null;
    renderUploadList();
    
    try {
        const response = await axios.get(API_BASE + `/api/uploads/${fileId}/info`);
        
        track.uploaded = { file_id: fileId };
        track.info = response.data.info;
        track.uploading = false;
        track.clips = [{ id: 1, start: 0, end: track.info.duration }];
        
        renderUploadList();
    } catch (error) {
        track.file = null;
        track.uploading = false;
        renderUploadList();
        alert('选择文件失败：' + (error.response?.data?.detail || error.message));
    }
};

window.closeHistoryModal = function() {
    document.getElementById('historyModal').classList.remove('show');
    currentHistoryIndex = null;
};
