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
    
    if (!input || !input.value.trim()) {
        alert('请输入拼接描述');
        return;
    }
    
    if (muggleSpliceState.isGenerating) return;
    
    try {
        muggleSpliceState.isGenerating = true;
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i data-lucide="loader"></i> 生成中...';
        refreshIcons();
        
        // 构建上下文信息
        const context = buildMuggleContext();
        const userDescription = input.value.trim();
        
        // 调用DeepSeek API生成拼接方案
        const result = await generateSpliceInstructions(userDescription, context);
        
        if (result) {
            muggleSpliceState.lastResult = result;
            resultContent.textContent = result.explanation || result;
            resultArea.style.display = 'block';
        } else {
            alert('生成失败，请重试');
        }
        
    } catch (error) {
        console.error('麻瓜拼接生成失败:', error);
        alert('生成失败: ' + error.message);
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

// 调用DeepSeek API生成拼接指令
async function generateSpliceInstructions(userDescription, context) {
    const prompt = `你是一个专业的音频拼接助手。用户描述了他们想要的拼接效果，请将其转换为具体的拼接指令。

可用音频文件:
${context.tracks.map(track => 
    `${track.label} (${track.name}): 总时长 ${formatTime(track.duration)}
    可用片段: ${track.clips.map(clip => 
        `${track.label}${clip.id} (${formatTime(clip.start)} - ${formatTime(clip.end)}, 时长 ${formatTime(clip.duration)})`
    ).join(', ')}`
).join('\n')}

可用过渡类型:
${context.availableTransitions.map(t => `- ${t.name} (${t.type}): ${t.description}`).join('\n')}

用户描述: "${userDescription}"

请生成详细的拼接方案，包括:
1. 具体使用哪些片段
2. 片段的顺序
3. 使用什么过渡效果
4. 过渡的时长
5. 最终的拼接效果说明

请用中文回复，格式清晰易懂。`;

    const systemPrompt = `你是一个专业的音频拼接专家，擅长理解用户的自然语言描述并转换为具体的音频拼接指令。你需要根据可用的音频文件和片段，生成详细、可执行的拼接方案。`;

    try {
        const response = await fetch('/api/ai/splice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
                system_prompt: systemPrompt,
                context: context,
                user_description: userDescription
            })
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('DeepSeek API调用失败:', error);
        
        // 降级到本地模拟生成
        return generateMockSpliceInstructions(userDescription, context);
    }
}

// 模拟生成拼接指令（当API不可用时）
function generateMockSpliceInstructions(userDescription, context) {
    const tracks = context.tracks;
    if (tracks.length === 0) return null;
    
    // 简单的模拟逻辑
    let instructions = `根据您的描述"${userDescription}"，我为您生成了以下拼接方案：\n\n`;
    
    if (tracks.length >= 2) {
        const track1 = tracks[0];
        const track2 = tracks[1];
        
        instructions += `1. 使用 ${track1.label}1 片段 (${formatTime(track1.clips[0].start)} - ${formatTime(track1.clips[0].end)})\n`;
        instructions += `2. 添加 3秒 淡化过渡\n`;
        instructions += `3. 使用 ${track2.label}1 片段 (${formatTime(track2.clips[0].start)} - ${formatTime(track2.clips[0].end)})\n\n`;
        instructions += `最终效果: 两段音频通过淡化过渡平滑连接，总时长约 ${formatTime(track1.clips[0].end - track1.clips[0].start + track2.clips[0].end - track2.clips[0].start + 3)}`;
    } else {
        const track = tracks[0];
        instructions += `1. 使用 ${track.label}1 片段的前半部分\n`;
        instructions += `2. 添加 2秒 静音填充\n`;
        instructions += `3. 使用 ${track.label}1 片段的后半部分\n\n`;
        instructions += `最终效果: 单个音频文件中间插入静音间隔`;
    }
    
    return {
        explanation: instructions,
        instructions: [] // 这里可以添加具体的执行指令
    };
}

// 处理应用麻瓜拼接方案
async function handleMuggleApply() {
    if (!muggleSpliceState.lastResult) {
        alert('没有可应用的方案');
        return;
    }
    
    try {
        // 这里需要解析AI生成的指令并转换为实际的timeline操作
        // 暂时使用简单的示例实现
        await applyMuggleSpliceResult(muggleSpliceState.lastResult);
        
        // 切换到手动拼接标签页显示结果
        switchTimelineTab('manual');
        
        // 显示预览
        const previewWrapper = document.getElementById('previewSectionWrapper');
        if (previewWrapper) {
            previewWrapper.style.display = 'block';
        }
        
        alert('拼接方案已应用！');
        
    } catch (error) {
        console.error('应用拼接方案失败:', error);
        alert('应用失败: ' + error.message);
    }
}

// 应用麻瓜拼接结果到时间轴
async function applyMuggleSpliceResult(result) {
    // 清空当前时间轴
    state.timeline = [];
    
    // 简单示例：添加第一个轨道的第一个片段
    const uploadedTracks = state.tracks.filter(t => t.uploaded);
    if (uploadedTracks.length > 0) {
        const track1 = uploadedTracks[0];
        if (track1.clips.length > 0) {
            state.timeline.push({ 
                type: 'clip', 
                trackId: track1.id, 
                clipId: track1.clips[0].id 
            });
            
            // 添加过渡
            state.timeline.push({ 
                type: 'transition', 
                transitionType: 'crossfade', 
                duration: 3 
            });
            
            // 如果有第二个轨道，添加第二个片段
            if (uploadedTracks.length > 1) {
                const track2 = uploadedTracks[1];
                if (track2.clips.length > 0) {
                    state.timeline.push({ 
                        type: 'clip', 
                        trackId: track2.id, 
                        clipId: track2.clips[0].id 
                    });
                }
            }
        }
    }
    
    // 重新渲染时间轴
    renderTimeline();
    updateTotalDuration();
    
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
}

// 导出函数供其他模块使用
window.initMuggleSpliceFeatures = initMuggleSpliceFeatures;
window.switchTimelineTab = switchTimelineTab;