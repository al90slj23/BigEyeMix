/**
 * Muggle.muggle.splice.js - 麻瓜拼接功能
 * BigEyeMix 麻瓜模式
 */

// 麻瓜拼接状态
const muggleSpliceState = {
    currentTab: 'muggle',
    isGenerating: false,
    lastResult: null
};

// 初始化标签页功能
function initTimelineTabs() {
    const tabs = document.querySelectorAll('.timeline-tab');
    const tabContents = document.querySelectorAll('.timeline-tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            switchTimelineTab(targetTab);
        });
    });
}

// 切换标签页
function switchTimelineTab(tabName) {
    const tabs = document.querySelectorAll('.timeline-tab');
    const tabContents = document.querySelectorAll('.timeline-tab-content');
    
    // 更新标签状态
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // 更新内容显示
    tabContents.forEach(content => {
        content.classList.toggle('active', content.dataset.tab === tabName);
    });
    
    muggleSpliceState.currentTab = tabName;
    
    // 如果切换到手动拼接，确保拖拽功能正常
    if (tabName === 'manual') {
        setTimeout(() => {
            initDragAndDrop();
        }, 100);
    }
}

// 初始化麻瓜拼接功能
function initMuggleSplice() {
    const generateBtn = document.getElementById('muggleGenerateBtn');
    const input = document.getElementById('muggleSpliceInput');
    const applyBtn = document.getElementById('muggleApplyBtn');
    const regenerateBtn = document.getElementById('muggleRegenerateBtn');
    
    if (generateBtn) {
        generateBtn.addEventListener('click', handleMuggleGenerate);
    }
    
    if (applyBtn) {
        applyBtn.addEventListener('click', handleMuggleApply);
    }
    
    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', handleMuggleRegenerate);
    }
    
    // 输入框变化时重置结果
    if (input) {
        input.addEventListener('input', () => {
            const resultArea = document.getElementById('muggleResultArea');
            if (resultArea) {
                resultArea.style.display = 'none';
            }
            muggleSpliceState.lastResult = null;
        });
    }
}

// 处理麻瓜拼接生成
async function handleMuggleGenerate() {
    const input = document.getElementById('muggleSpliceInput');
    const generateBtn = document.getElementById('muggleGenerateBtn');
    const resultArea = document.getElementById('muggleResultArea');
    const resultContent = document.getElementById('muggleResultContent');
    const thinkingBox = document.getElementById('muggleThinkingBox');
    const thinkingContent = document.getElementById('muggleThinkingContent');
    
    if (!input || !input.value.trim()) {
        alert('请输入拼接描述');
        return;
    }
    
    if (muggleSpliceState.isGenerating) return;
    
    try {
        muggleSpliceState.isGenerating = true;
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i data-lucide="loader"></i> AI分析中...';
        refreshIcons();
        
        // 构建上下文信息
        const context = buildMuggleContext();
        const userDescription = input.value.trim();
        
        // 显示思考过程窗口
        if (resultArea && thinkingBox && thinkingContent) {
            resultArea.style.display = 'block';
            thinkingBox.style.display = 'block';
            thinkingContent.innerHTML = '';
            resultContent.innerHTML = '<div class="generating-status"><i data-lucide="brain-circuit"></i> AI正在分析您的描述...</div>';
            refreshIcons();
        }
        
        // 使用流式 API
        await generateSpliceInstructionsStream(userDescription, context, thinkingContent, resultContent);
        
    } catch (error) {
        console.error('麻瓜拼接生成失败:', error);
        if (resultContent) {
            resultContent.innerHTML = `<div class="error-content">❌ 生成失败: ${error.message}</div>`;
        }
    } finally {
        muggleSpliceState.isGenerating = false;
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i data-lucide="sparkles"></i> 生成拼接方案';
        refreshIcons();
    }
}

// 构建麻瓜拼接的上下文信息
function buildMuggleContext() {
    const uploadedTracks = state.tracks.filter(t => t.uploaded);
    const context = {
        tracks: uploadedTracks.map((track, index) => ({
            id: track.id,
            label: track.label,
            name: track.file.name,
            duration: track.info.duration,
            clips: track.clips.map(clip => ({
                id: clip.id,
                start: clip.start,
                end: clip.end,
                duration: clip.end - clip.start
            }))
        })),
        availableTransitions: [
            { type: 'crossfade', name: '淡化过渡', description: '两段音频平滑过渡' },
            { type: 'beatsync', name: '节拍过渡', description: '按节拍对齐过渡' },
            { type: 'magicfill', name: '魔法填充', description: 'AI生成过渡音频' },
            { type: 'silence', name: '静音填充', description: '插入静音间隔' }
        ]
    };
    
    return context;
}

// 从文本中提取 JSON（处理 markdown 代码块等格式）
function extractJsonFromText(text) {
    // 移除可能的 markdown 代码块标记
    text = text.trim();
    
    // 尝试移除 ```json 和 ``` 标记
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    
    // 尝试找到第一个 { 和最后一个 }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        let jsonText = text.substring(firstBrace, lastBrace + 1);
        
        // 将 Python 字典格式转换为标准 JSON 格式
        // 1. 将单引号替换为双引号（但要小心字符串内部的单引号）
        // 2. 处理 True/False/None 等 Python 特有的值
        jsonText = jsonText
            .replace(/'/g, '"')  // 单引号 → 双引号
            .replace(/True/g, 'true')  // Python True → JSON true
            .replace(/False/g, 'false')  // Python False → JSON false
            .replace(/None/g, 'null');  // Python None → JSON null
        
        return jsonText;
    }
    
    return text.trim();
}

// 调用DeepSeek API生成拼接指令（流式）
async function generateSpliceInstructionsStream(userDescription, context, thinkingElement, resultElement) {
    return new Promise((resolve, reject) => {
        const requestBody = {
            prompt: '', // 会在后端构建
            system_prompt: '', // 会在后端构建
            context: context,
            user_description: userDescription
        };
        
        // 使用 fetch 的流式读取
        fetch('/api/ai/splice/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let reasoningText = '';
            let contentText = '';
            
            function processText({ done, value }) {
                if (done) {
                    // 流结束，解析最终结果
                    try {
                        // DeepSeek Reasoner 的输出格式：
                        // - reasoning_content: 推理过程（已显示在思考窗口）
                        // - content: 最终 JSON 输出
                        
                        let textToParse = contentText.trim();
                        
                        // 如果 content 为空或只有 null，说明 JSON 在 reasoning 的最后
                        if (!textToParse || textToParse === 'null' || textToParse === '') {
                            console.log('[Stream] content 为空，尝试从 reasoning 中提取 JSON');
                            textToParse = reasoningText;
                        }
                        
                        console.log('[Stream] 准备解析的文本长度:', textToParse.length);
                        
                        // 提取 JSON（可能被包裹在 markdown 代码块或其他文本中）
                        const jsonContent = extractJsonFromText(textToParse);
                        console.log('[Stream] 提取的 JSON 长度:', jsonContent.length);
                        
                        const result = JSON.parse(jsonContent);
                        console.log('[Stream] 解析成功:', result);
                        
                        // 验证和处理结果
                        if (result.explanation && result.instructions) {
                            muggleSpliceState.lastResult = {
                                ...result,
                                success: true
                            };
                            
                            // 显示结果（人类可读的说明）
                            let displayContent = result.explanation;
                            if (result.estimated_duration) {
                                displayContent += `\n\n⏱️ 预估总时长：${formatTime(result.estimated_duration)}`;
                            }
                            
                            resultElement.innerHTML = `<div class="result-content">${displayContent.replace(/\n/g, '<br>')}</div>`;
                            
                            // 显示应用按钮
                            const applyBtn = document.getElementById('muggleApplyBtn');
                            const regenerateBtn = document.getElementById('muggleRegenerateBtn');
                            if (applyBtn) applyBtn.style.display = 'inline-block';
                            if (regenerateBtn) regenerateBtn.style.display = 'inline-block';
                            
                            // 保持思考窗口显示，让用户可以查看 AI 的推理过程
                            
                            resolve(result);
                        } else {
                            throw new Error('AI 返回的数据格式不正确：缺少 explanation 或 instructions 字段');
                        }
                    } catch (e) {
                        console.error('[Stream] 解析失败');
                        console.error('[Stream] contentText:', contentText);
                        console.error('[Stream] reasoningText 长度:', reasoningText.length);
                        console.error('[Stream] 错误:', e);
                        reject(new Error(`解析结果失败: ${e.message}`));
                    }
                    return;
                }
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);
                        
                        try {
                            const data = JSON.parse(dataStr);
                            
                            if (data.error) {
                                reject(new Error(data.error));
                                return;
                            }
                            
                            if (data.type === 'reasoning') {
                                // 推理过程 - 打字机效果
                                reasoningText += data.content;
                                thinkingElement.textContent = reasoningText;
                                // 自动滚动到底部
                                thinkingElement.scrollTop = thinkingElement.scrollHeight;
                            } else if (data.type === 'content') {
                                // 最终内容
                                contentText += data.content;
                            } else if (data.type === 'extract_from_reasoning') {
                                // 后端告诉我们：content 为空，需要从 reasoning 中提取 JSON
                                console.log('[Stream] 后端指示从 reasoning 中提取 JSON');
                                // 使用后端发送的完整 reasoning（避免前端累积不完整）
                                if (data.reasoning) {
                                    reasoningText = data.reasoning;
                                }
                                // 标记需要从 reasoning 提取
                                contentText = ''; // 清空，强制从 reasoning 提取
                            } else if (data.done) {
                                // 完成标记
                                return reader.read().then(processText);
                            }
                        } catch (e) {
                            console.warn('解析 SSE 数据失败:', e, dataStr);
                        }
                    }
                }
                
                return reader.read().then(processText);
            }
            
            return reader.read().then(processText);
        })
        .catch(error => {
            reject(error);
        });
    });
}

// 处理应用麻瓜拼接方案
async function handleMuggleApply() {
    if (!muggleSpliceState.lastResult) {
        alert('没有可应用的方案');
        return;
    }
    
    try {
        // 隐藏应用按钮，显示加载状态
        const applyBtn = document.getElementById('muggleApplyBtn');
        const regenerateBtn = document.getElementById('muggleRegenerateBtn');
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.innerHTML = '<i data-lucide="loader"></i> 应用中...';
            refreshIcons();
        }
        if (regenerateBtn) regenerateBtn.style.display = 'none';
        
        // 应用拼接方案到时间轴
        await applyMuggleSpliceResult(muggleSpliceState.lastResult);
        
        // 显示预览区域
        const previewWrapper = document.getElementById('previewSectionWrapper');
        if (previewWrapper) {
            previewWrapper.style.display = 'block';
            // 等待一下让 DOM 更新
            await new Promise(resolve => setTimeout(resolve, 100));
            // 滚动到预览区域
            previewWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        
        // 隐藏应用按钮
        if (applyBtn) applyBtn.style.display = 'none';
        
        // 在结果区域添加成功提示
        const resultContent = document.getElementById('muggleResultContent');
        if (resultContent) {
            const successMsg = document.createElement('div');
            successMsg.className = 'success-message';
            successMsg.innerHTML = '<i data-lucide="check-circle"></i> 方案已应用，请查看下方预览';
            resultContent.appendChild(successMsg);
            refreshIcons();
        }
        
    } catch (error) {
        console.error('应用拼接方案失败:', error);
        
        // 恢复按钮状态
        const applyBtn = document.getElementById('muggleApplyBtn');
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.innerHTML = '<i data-lucide="play"></i> 应用方案';
            applyBtn.style.display = 'inline-block';
            refreshIcons();
        }
        
        // 显示错误提示
        const resultContent = document.getElementById('muggleResultContent');
        if (resultContent) {
            const errorMsg = document.createElement('div');
            errorMsg.className = 'error-message';
            errorMsg.innerHTML = `<i data-lucide="alert-circle"></i> 应用失败: ${error.message}`;
            resultContent.appendChild(errorMsg);
            refreshIcons();
        }
    }
}

// 应用麻瓜拼接结果到时间轴
async function applyMuggleSpliceResult(result) {
    // 清空当前时间轴
    state.timeline = [];
    
    // 检查是否有指令
    if (!result.instructions || result.instructions.length === 0) {
        throw new Error('没有可执行的拼接指令');
    }
    
    // 确保编辑器已渲染（如果还在第1步，需要先渲染编辑器）
    const previewSection = document.getElementById('previewSection');
    if (!previewSection) {
        console.log('[Muggle Splice] Editor not rendered, rendering now...');
        if (typeof renderEditorAndTimeline === 'function') {
            renderEditorAndTimeline();
            // 等待 DOM 更新
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    // 解析并应用每条指令
    for (const instruction of result.instructions) {
        if (instruction.type === 'clip') {
            // 查找对应的轨道和片段（支持通过 ID 或 label 查找）
            const track = state.tracks.find(t => t.id === instruction.trackId || t.label === instruction.trackId);
            if (!track) {
                console.warn(`未找到轨道: ${instruction.trackId}`);
                continue;
            }
            
            // 查找 clip，支持数字和字符串类型的 clipId
            const clip = track.clips.find(c => 
                c.id === instruction.clipId || 
                c.id === parseInt(instruction.clipId) ||
                String(c.id) === String(instruction.clipId)
            );
            if (!clip) {
                console.warn(`未找到片段: ${instruction.trackId}${instruction.clipId}`, 'track.clips:', track.clips);
                continue;
            }
            
            // 构建时间轴项（使用实际的数字 ID，而不是 label）
            const timelineItem = {
                type: 'clip',
                trackId: track.id,  // 使用实际的数字 ID
                clipId: clip.id     // 使用实际找到的 clip.id
            };
            
            // 如果有自定义时间范围，添加到时间轴项
            if (instruction.customStart !== undefined || instruction.customEnd !== undefined) {
                timelineItem.customStart = instruction.customStart !== undefined ? instruction.customStart : clip.start;
                timelineItem.customEnd = instruction.customEnd !== undefined ? instruction.customEnd : clip.end;
            }
            
            state.timeline.push(timelineItem);
            
        } else if (instruction.type === 'transition') {
            // 添加过渡块
            const transitionItem = {
                type: 'transition',
                transitionType: instruction.transitionType || 'crossfade',
                duration: instruction.duration || 3,
                transitionId: `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };
            
            // 如果是 crossfade 或 beatsync，需要检查前后是否有片段
            if ((instruction.transitionType === 'crossfade' || instruction.transitionType === 'beatsync') && 
                state.timeline.length > 0) {
                
                const prevItem = state.timeline[state.timeline.length - 1];
                if (prevItem.type === 'clip') {
                    // 获取前一个片段的信息
                    const prevTrack = state.tracks.find(t => t.id === prevItem.trackId);
                    const prevClip = prevTrack?.clips.find(c => c.id === prevItem.clipId);
                    
                    if (prevClip && prevTrack.uploaded) {
                        const halfDuration = transitionItem.duration / 2;
                        const prevEnd = prevItem.customEnd !== undefined ? prevItem.customEnd : prevClip.end;
                        
                        // 存储过渡数据（包含 prevFileId）
                        transitionItem.transitionData = {
                            prevTrackId: prevItem.trackId,
                            prevClipId: prevItem.clipId,
                            prevFileId: prevTrack.uploaded.file_id,
                            prevFadeStart: prevEnd - halfDuration,
                            prevFadeEnd: prevEnd
                        };
                    }
                }
            }
            
            state.timeline.push(transitionItem);
        }
    }
    
    // 更新不完整的过渡块（补充 nextFileId 等信息）
    if (typeof updateIncompleteTransitions === 'function') {
        updateIncompleteTransitions();
    }
    
    // 重新渲染时间轴（如果在手动拼接标签页）
    if (typeof renderTimeline === 'function') {
        renderTimeline();
    }
    if (typeof updateTotalDuration === 'function') {
        updateTotalDuration();
    }
    
    // 生成预览
    if (state.timeline.length > 0) {
        await doUpdatePreview();
    }
}

// 处理重新生成
function handleMuggleRegenerate() {
    const resultArea = document.getElementById('muggleResultArea');
    if (resultArea) {
        resultArea.style.display = 'none';
    }
    muggleSpliceState.lastResult = null;
    handleMuggleGenerate();
}

// 在编辑器初始化时调用
function initMuggleSpliceFeatures() {
    initTimelineTabs();
    initMuggleSplice();
    
    // 初始化语音输入功能
    if (typeof initVoiceInput === 'function') {
        initVoiceInput();
    }
}

// 导出函数供其他模块使用
window.initMuggleSpliceFeatures = initMuggleSpliceFeatures;
window.switchTimelineTab = switchTimelineTab;

// 初始化 JSON 信息按钮
function initJsonInfoButton() {
    const jsonInfoBtn = document.getElementById('muggleJsonInfoBtn');
    const jsonModal = document.getElementById('muggleJsonModal');
    const jsonModalOverlay = document.getElementById('muggleJsonModalOverlay');
    const jsonModalClose = document.getElementById('muggleJsonModalClose');
    const jsonModalBody = document.getElementById('muggleJsonModalBody');
    
    if (!jsonInfoBtn || !jsonModal) return;
    
    // 点击问号按钮显示模态框
    jsonInfoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (muggleSpliceState.lastResult && muggleSpliceState.lastResult.instructions) {
            // 格式化 JSON 数据
            const jsonData = {
                instructions: muggleSpliceState.lastResult.instructions,
                estimated_duration: muggleSpliceState.lastResult.estimated_duration,
                validation_errors: muggleSpliceState.lastResult.validation_errors || []
            };
            
            jsonModalBody.textContent = JSON.stringify(jsonData, null, 2);
            jsonModal.style.display = 'flex';
        } else {
            alert('暂无可显示的拼接指令');
        }
    });
    
    // 点击关闭按钮
    if (jsonModalClose) {
        jsonModalClose.addEventListener('click', () => {
            jsonModal.style.display = 'none';
        });
    }
    
    // 点击遮罩层关闭
    if (jsonModalOverlay) {
        jsonModalOverlay.addEventListener('click', () => {
            jsonModal.style.display = 'none';
        });
    }
    
    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && jsonModal.style.display === 'flex') {
            jsonModal.style.display = 'none';
        }
    });
}

// 初始化思考过程复制按钮
function initThinkingCopyButton() {
    const copyBtn = document.getElementById('muggleThinkingCopyBtn');
    const thinkingContent = document.getElementById('muggleThinkingContent');
    
    if (!copyBtn || !thinkingContent) return;
    
    copyBtn.addEventListener('click', async () => {
        const text = thinkingContent.textContent;
        
        if (!text || text.trim() === '') {
            return;
        }
        
        try {
            await navigator.clipboard.writeText(text);
            
            // 显示复制成功提示
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i data-lucide="check"></i>';
            copyBtn.classList.add('copied');
            refreshIcons();
            
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.classList.remove('copied');
                refreshIcons();
            }, 2000);
        } catch (err) {
            console.error('复制失败:', err);
            alert('复制失败，请手动选择文本复制');
        }
    });
}

// 在编辑器初始化时调用
document.addEventListener('DOMContentLoaded', () => {
    initJsonInfoButton();
    initThinkingCopyButton();
});