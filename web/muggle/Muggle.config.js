/**
 * Muggle.config.js - 配置与状态管理
 * BigEyeMix 麻瓜模式
 */

// API 基础地址
// 本地开发时也使用服务器 API（因为魔法填充需要公网可访问的音频 URL）
const API_BASE = 'https://bem.it.sc.cn';

// 状态管理
const state = {
    currentStep: 1,
    totalSteps: 3,
    tracks: [], // { id, file, uploaded, info, wavesurfer, clips: [{id, start, end}], color }
    timeline: [], // 组合时间线 [{type: 'clip', trackId, clipId} | {type: 'transition', duration, transitionType}]
    previewWavesurfer: null
};

// 处理块类型（顺序：魔法填充 > 节拍过渡 > 淡化过渡 > 静音填充）
const transitionTypes = {
    magicfill: { name: '魔法填充',  icon: 'sparkles',    color: '#8b5cf6', desc: '智能生成过渡音频' },
    beatsync:  { name: '节拍过渡',  icon: 'activity',    color: '#ec4899', desc: '基于BPM节拍对齐' },
    crossfade: { name: '淡化过渡',  icon: 'git-merge',   color: '#f59e0b', desc: '平滑音量渐变' },
    silence:   { name: '静音填充',  icon: 'volume-x',    color: '#6b7280', desc: '无声过渡' }
};

// 处理类型顺序
const transitionTypeOrder = ['magicfill', 'beatsync', 'crossfade', 'silence'];

// 预设处理块（秒）- 默认使用魔法填充
const transitionPresets = [1, 3, 5, 10];

// 轨道标签
const trackLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// 轨道颜色（红橙黄绿青蓝紫）
const trackColors = [
    { name: 'red',    bg: '#ef4444', light: '#fecaca', wave: '#f87171' },
    { name: 'orange', bg: '#f97316', light: '#fed7aa', wave: '#fb923c' },
    { name: 'yellow', bg: '#eab308', light: '#fef08a', wave: '#facc15' },
    { name: 'green',  bg: '#22c55e', light: '#bbf7d0', wave: '#4ade80' },
    { name: 'cyan',   bg: '#06b6d4', light: '#a5f3fc', wave: '#22d3ee' },
    { name: 'blue',   bg: '#3b82f6', light: '#bfdbfe', wave: '#60a5fa' },
    { name: 'purple', bg: '#8b5cf6', light: '#ddd6fe', wave: '#a78bfa' }
];
