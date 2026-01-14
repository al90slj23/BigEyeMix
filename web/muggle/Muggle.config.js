/**
 * Muggle.config.js - 配置与状态管理
 * BigEyeMix 麻瓜模式
 */

// API 基础地址
const API_BASE = window.location.port === '8080' ? 'http://' + window.location.hostname + ':8000' : '';

// 状态管理
const state = {
    currentStep: 1,
    totalSteps: 3,
    tracks: [], // { id, file, uploaded, info, wavesurfer, clips: [{id, start, end}], color }
    timeline: [], // 组合时间线 [{type: 'clip', trackId, clipId} | {type: 'gap', duration, gapType}]
    previewWavesurfer: null
};

// 间隔块类型
const gapTypes = {
    ai_fill: { name: 'AI 填充', icon: 'sparkles', color: '#8b5cf6' },
    silence: { name: '静音', icon: 'volume-x', color: '#6b7280' },
    crossfade: { name: '淡入淡出', icon: 'zap', color: '#f59e0b' }
};

// 预设间隔块（秒）- 默认使用 AI 填充
const gapPresets = [1, 2, 3, 5, 10];

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
