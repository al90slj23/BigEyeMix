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
        generateBtn.innerHTML = '<i data-lucide="loader"></i> AI分析中...';
        refreshIcons();
        
        // 构建上下文信息
        const context = buildMuggleContext();
        const userDescription = input.value.trim();
        
        // 显示生成状态
        if (resultArea) {
            resultArea.style.display = 'block';
            resultContent.innerHTML = '<div class="generating-status"><i data-lucide="brain-circuit"></i> AI正在分析您的描述...</div>';
            refreshIcons();
        }
        
        // 调用DeepSeek API生成拼接方案
        const result = await generateSpliceInstructions(userDescription, context);
        
        if (result && result.success) {
            muggleSpliceState.lastResult = result;
            
            // 格式化显示结果
            let displayContent = result.explanation || result;
            
            // 添加验证信息
            if (result.validation_errors && result.validation_errors.length > 0) {
                displayContent += '\n\n⚠️ 注意事项：\n' + result.validation_errors.map(err => `• ${err}`).join('\n');
            }
            
            // 添加重试信息
            if (result.retry_count && result.retry_count > 0) {
                displayContent += `\n\n🔄 此方案经过 ${result.retry_count + 1} 次AI优化生成`;
            }
            
            // 添加预估时长信息
            if (result.estimated_duration) {
                displayContent += `\n\n⏱️ 预估总时长：${formatTime(result.estimated_duration)}`;
            }
            
            resultContent.innerHTML = `<div class="result-content">${displayContent.replace(/\n/g, '<br>')}</div>`;
            
            // 显示应用按钮
            const applyBtn = document.getElementById('muggleApplyBtn');
            const regenerateBtn = document.getElementById('muggleRegenerateBtn');
            if (applyBtn) applyBtn.style.display = 'inline-block';
            if (regenerateBtn) regenerateBtn.style.display = 'inline-block';
            
        } else {
            resultContent.innerHTML = '<div class="error-content">❌ 生成失败，请检查描述后重试</div>';
            
            if (result && result.validation_errors) {
                resultContent.innerHTML += '<div class="error-details">错误详情：<br>' + 
                    result.validation_errors.map(err => `• ${err}`).join('<br>') + '</div>';
            }
        }
        
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

// 调用DeepSeek API生成拼接指令
async function generateSpliceInstructions(userDescription, context) {
    const prompt = `你是专业的音频拼接专家。请根据用户描述生成详细的拼接方案。

可用音频文件:
${context.tracks.map(track => 
    `${track.label} (${track.name}): 总时长 ${formatTime(track.duration)}
    可用片段: ${track.clips.map(clip => 
        `${track.label}${clip.id} (${formatTime(clip.start)} - ${formatTime(clip.end)}, 时长 ${formatTime(clip.duration)})`
    ).join(', ')}`
).join('\n')}

可用处理类型:
${context.availableTransitions.map(t => `- ${t.name} (${t.type}): ${t.description}`).join('\n')}

用户描述: "${userDescription}"

请严格按照以下JSON格式返回拼接方案：

\`\`\`json
{
  "explanation": "详细的拼接方案说明",
  "instructions": [
    {
      "type": "clip",
      "trackId": "轨道ID", 
      "clipId": "片段ID"
    },
    {
      "type": "transition",
      "transitionType": "crossfade|beatsync|magicfill|silence",
      "duration": 处理时长数值
    }
  ],
  "estimated_duration": 预估总时长数值
}
\`\`\`

重要规则：
1. 必须返回有效的JSON格式
2. 指令序列必须以clip开始
3. 不能有连续的transition指令
4. 处理时长必须为正数且≤30秒
5. crossfade和beatsync会减少总时长，magicfill和silence会增加总时长

只返回JSON，不要添加其他说明文字。`;

    const systemPrompt = `你是专业的音频拼接专家，擅长理解用户的自然语言描述并转换为结构化的音频拼接指令。你必须严格按照JSON格式返回结果，确保所有指令都是可执行的。`;

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
            // 尝试获取详细的错误信息
            let errorDetail = `${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.detail) {
                    errorDetail += ` - ${errorData.detail}`;
                }
            } catch (e) {
                // 如果无法解析 JSON，尝试获取文本
                try {
                    const errorText = await response.text();
                    if (errorText) {
                        errorDetail += ` - ${errorText.substring(0, 200)}`;
                    }
                } catch (e2) {
                    // 忽略
                }
            }
            throw new Error(`API请求失败: ${errorDetail}`);
        }

        const result = await response.json();
        
        // 检查是否有验证错误
        if (result.validation_errors && result.validation_errors.length > 0) {
            console.warn('AI响应验证警告:', result.validation_errors);
        }
        
        // 显示重试信息
        if (result.retry_count && result.retry_count > 0) {
            console.info(`AI响应经过 ${result.retry_count + 1} 次尝试生成`);
        }
        
        return result;
        
    } catch (error) {
        console.error('DeepSeek API调用失败:', error);
        // 直接抛出错误，不使用模拟响应
        throw error;
    }
}

// 处理应用麻瓜拼接方案
async function handleMuggleApply() {
    if (!muggleSpliceState.lastResult) {
        alert('没有可应用的方案');
        return;
    }
    
    try {
        // 应用拼接方案到时间轴
        await applyMuggleSpliceResult(muggleSpliceState.lastResult);
        
        // 不切换标签页，直接在麻瓜拼接标签页下显示预览
        // 显示预览区域
        const previewWrapper = document.getElementById('previewSectionWrapper');
        if (previewWrapper) {
            previewWrapper.style.display = 'block';
            // 滚动到预览区域
            previewWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        
        // 隐藏应用按钮，显示成功提示
        const applyBtn = document.getElementById('muggleApplyBtn');
        const regenerateBtn = document.getElementById('muggleRegenerateBtn');
        if (applyBtn) applyBtn.style.display = 'none';
        if (regenerateBtn) regenerateBtn.style.display = 'none';
        
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
        alert('应用失败: ' + error.message);
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
    
    // 解析并应用每条指令
    for (const instruction of result.instructions) {
        if (instruction.type === 'clip') {
            // 查找对应的轨道和片段（支持通过 ID 或 label 查找）
            const track = state.tracks.find(t => t.id === instruction.trackId || t.label === instruction.trackId);
            if (!track) {
                console.warn(`未找到轨道: ${instruction.trackId}`);
                continue;
            }
            
            const clip = track.clips.find(c => c.id === instruction.clipId);
            if (!clip) {
                console.warn(`未找到片段: ${instruction.trackId}${instruction.clipId}`);
                continue;
            }
            
            // 构建时间轴项（使用实际的数字 ID，而不是 label）
            const timelineItem = {
                type: 'clip',
                trackId: track.id,  // 使用实际的数字 ID
                clipId: instruction.clipId
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
                    
                    if (prevClip) {
                        const halfDuration = transitionItem.duration / 2;
                        const prevEnd = prevItem.customEnd !== undefined ? prevItem.customEnd : prevClip.end;
                        
                        // 存储过渡数据
                        transitionItem.transitionData = {
                            prevTrackId: prevItem.trackId,
                            prevClipId: prevItem.clipId,
                            prevFadeStart: prevEnd - halfDuration,
                            prevFadeEnd: prevEnd
                        };
                    }
                }
            }
            
            state.timeline.push(transitionItem);
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
    
    // 初始化语音输入功能
    if (typeof initVoiceInput === 'function') {
        initVoiceInput();
    }
}

// 导出函数供其他模块使用
window.initMuggleSpliceFeatures = initMuggleSpliceFeatures;
window.switchTimelineTab = switchTimelineTab;