/**
 * Muggle.utils.js - 工具函数
 * BigEyeMix 麻瓜模式
 */

/**
 * 格式化秒数为 mm:ss.cc 格式
 * @param {number} seconds 
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(seconds) {
    if (seconds === undefined || seconds === null || isNaN(seconds)) return '00:00.00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const secsInt = Math.floor(secs);
    const centisecs = Math.round((secs - secsInt) * 100);
    return `${mins.toString().padStart(2, '0')}:${secsInt.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
}

/**
 * 智能解析时间输入，支持多种格式
 * 
 * 支持格式：
 * - 标准格式: "12:34.56" -> 12分34.56秒
 * - 纯数字5位: "25318" -> 2:53.18 (2分53秒18)
 * - 纯数字6位: "253138" -> 25:31.38 (25分31秒38)
 * - 纯数字4位: "2531" -> 25.31秒
 * - 纯数字3位: "253" -> 2.53秒
 * - 纯数字1-2位: "25" -> 25秒
 * - 带冒号: "2:53" -> 2分53秒
 * - 带点: "25.31" -> 25.31秒
 * 
 * @param {string} str 输入字符串
 * @returns {number} 秒数
 */
function parseTime(str) {
    if (!str) return 0;
    str = str.toString().trim();
    
    // 已经是标准格式 mm:ss.cc
    if (/^\d+:\d+\.\d+$/.test(str)) {
        const [minPart, secPart] = str.split(':');
        return parseInt(minPart) * 60 + parseFloat(secPart);
    }
    
    // 格式 mm:ss (无小数)
    if (/^\d+:\d+$/.test(str)) {
        const [mins, secs] = str.split(':');
        return parseInt(mins) * 60 + parseInt(secs);
    }
    
    // 格式 ss.cc (纯秒数带小数)
    if (/^\d+\.\d+$/.test(str)) {
        return parseFloat(str);
    }
    
    // 纯数字，智能解析
    if (/^\d+$/.test(str)) {
        const len = str.length;
        
        if (len <= 2) {
            // 1-2位: 纯秒数 "25" -> 25秒
            return parseInt(str);
        } else if (len === 3) {
            // 3位: s.cc "253" -> 2.53秒
            const secs = parseInt(str[0]);
            const centisecs = parseInt(str.slice(1));
            return secs + centisecs / 100;
        } else if (len === 4) {
            // 4位: ss.cc "2531" -> 25.31秒
            const secs = parseInt(str.slice(0, 2));
            const centisecs = parseInt(str.slice(2));
            return secs + centisecs / 100;
        } else if (len === 5) {
            // 5位: m:ss.cc "25318" -> 2:53.18
            const mins = parseInt(str[0]);
            const secs = parseInt(str.slice(1, 3));
            const centisecs = parseInt(str.slice(3));
            return mins * 60 + secs + centisecs / 100;
        } else if (len === 6) {
            // 6位: mm:ss.cc "253138" -> 25:31.38
            const mins = parseInt(str.slice(0, 2));
            const secs = parseInt(str.slice(2, 4));
            const centisecs = parseInt(str.slice(4));
            return mins * 60 + secs + centisecs / 100;
        } else if (len >= 7) {
            // 7位+: mmm:ss.cc "1253138" -> 125:31.38
            const mins = parseInt(str.slice(0, len - 4));
            const secs = parseInt(str.slice(len - 4, len - 2));
            const centisecs = parseInt(str.slice(len - 2));
            return mins * 60 + secs + centisecs / 100;
        }
    }
    
    // 兜底：尝试直接解析
    return parseFloat(str) || 0;
}

function refreshIcons() {
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * 使用预计算波形数据加速加载
 * 先尝试获取缓存的波形数据快速渲染，同时后台加载音频
 * 
 * @param {WaveSurfer} wavesurfer WaveSurfer 实例
 * @param {string} fileId 文件 ID
 * @param {HTMLElement} loadingEl 加载提示元素
 */
async function loadWaveformWithCache(wavesurfer, fileId, loadingEl) {
    try {
        // 1. 先尝试获取预计算的波形数据
        const waveformRes = await axios.get(API_BASE + `/api/uploads/${fileId}/waveform`);
        
        if (waveformRes.data.success && waveformRes.data.waveform) {
            // 使用预计算的波形数据快速渲染
            const peaks = waveformRes.data.waveform;
            const duration = waveformRes.data.duration;
            
            // 更新加载提示
            if (loadingEl) {
                loadingEl.querySelector('.waveform-loading-text').textContent = '加载音频中...';
            }
            
            // 使用预计算波形 + 加载音频
            wavesurfer.load(API_BASE + `/api/audio/${fileId}`, [peaks], duration);
            
            console.log(`[Waveform] Loaded with cached peaks for ${fileId}`);
        } else {
            // 没有缓存，直接加载
            wavesurfer.load(API_BASE + `/api/audio/${fileId}`);
        }
    } catch (error) {
        console.log(`[Waveform] Cache not available, loading directly: ${error.message}`);
        // 缓存获取失败，直接加载音频
        wavesurfer.load(API_BASE + `/api/audio/${fileId}`);
    }
}
