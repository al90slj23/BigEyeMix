"""
节拍对齐服务 - 智能节拍检测和对齐
BigEyeMix 音频拼接过渡增强
"""
import librosa
import numpy as np
from pydub import AudioSegment
import logging
from typing import Dict, Tuple, Optional

logger = logging.getLogger(__name__)

class BeatSyncService:
    """节拍对齐处理服务"""
    
    def __init__(self):
        self.default_transition_beats = 4  # 默认4拍过渡
        self.min_tempo = 60  # 最小BPM
        self.max_tempo = 200  # 最大BPM
    
    async def sync_and_transition(
        self, 
        audio1_path: str, 
        audio2_path: str,
        transition_beats: int = 4
    ) -> Tuple[AudioSegment, Dict]:
        """
        在节拍点进行智能对齐和过渡
        
        Args:
            audio1_path: 第一段音频路径
            audio2_path: 第二段音频路径
            transition_beats: 过渡节拍数
            
        Returns:
            (处理后的音频, 处理信息)
        """
        try:
            logger.info(f"开始节拍对齐: {audio1_path} -> {audio2_path}")
            
            # 1. 检测节拍
            beat_info1 = self._detect_beats(audio1_path)
            beat_info2 = self._detect_beats(audio2_path)
            
            logger.info(f"音频1 BPM: {beat_info1['tempo']:.1f}, 音频2 BPM: {beat_info2['tempo']:.1f}")
            
            # 2. 计算最佳过渡点
            transition_point1 = self._find_best_transition_point(
                beat_info1, 
                from_end=True
            )
            transition_point2 = self._find_best_transition_point(
                beat_info2, 
                from_end=False
            )
            
            # 3. 计算过渡时长
            avg_tempo = (beat_info1['tempo'] + beat_info2['tempo']) / 2
            beat_duration = 60.0 / avg_tempo
            transition_duration = beat_duration * transition_beats
            
            logger.info(f"过渡点: {transition_point1:.2f}s -> {transition_point2:.2f}s, 时长: {transition_duration:.2f}s")
            
            # 4. 执行过渡
            result = self._execute_beat_transition(
                audio1_path,
                audio2_path,
                transition_point1,
                transition_point2,
                transition_duration
            )
            
            # 5. 返回处理信息
            info = {
                'success': True,
                'tempo1': float(beat_info1['tempo']),
                'tempo2': float(beat_info2['tempo']),
                'transition_point1': float(transition_point1),
                'transition_point2': float(transition_point2),
                'transition_duration': float(transition_duration),
                'transition_beats': transition_beats
            }
            
            logger.info(f"节拍对齐完成: {transition_beats}拍过渡")
            return result, info
            
        except Exception as e:
            logger.error(f"节拍对齐失败: {str(e)}, 降级到普通crossfade")
            # 降级到普通crossfade
            result = self._fallback_crossfade(audio1_path, audio2_path)
            info = {
                'success': False,
                'error': str(e),
                'fallback': 'crossfade'
            }
            return result, info
    
    def _detect_beats(self, audio_path: str) -> Dict:
        """检测音频节拍信息"""
        try:
            # 加载音频（降采样以提高速度）
            y, sr = librosa.load(audio_path, sr=22050)
            
            # 检测节拍
            tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
            beat_times = librosa.frames_to_time(beats, sr=sr)
            
            # 验证tempo合理性
            if tempo < self.min_tempo or tempo > self.max_tempo:
                logger.warning(f"检测到异常BPM: {tempo}, 使用默认值120")
                tempo = 120.0
            
            return {
                'tempo': float(tempo),
                'beats': beats,
                'beat_times': beat_times,
                'duration': len(y) / sr,
                'beat_count': len(beats)
            }
        except Exception as e:
            logger.error(f"节拍检测失败: {str(e)}")
            raise
    
    def _find_best_transition_point(
        self, 
        beat_info: Dict, 
        from_end: bool = True
    ) -> float:
        """找到最佳过渡点（强拍位置）"""
        beat_times = beat_info['beat_times']
        
        if len(beat_times) == 0:
            # 没有检测到节拍，使用音频边界
            return beat_info['duration'] if from_end else 0.0
        
        if from_end:
            # 从末尾找最后一个节拍（留一些余量）
            # 使用倒数第2个节拍，避免音频末尾的静音
            if len(beat_times) >= 2:
                return beat_times[-2]
            else:
                return beat_times[-1]
        else:
            # 从开头找第一个节拍
            # 跳过开头可能的静音，使用第2个节拍
            if len(beat_times) >= 2:
                return beat_times[1]
            else:
                return beat_times[0]
    
    def _execute_beat_transition(
        self,
        audio1_path: str,
        audio2_path: str,
        point1: float,
        point2: float,
        duration: float
    ) -> AudioSegment:
        """执行节拍对齐的过渡"""
        audio1 = AudioSegment.from_file(audio1_path)
        audio2 = AudioSegment.from_file(audio2_path)
        
        # 转换为毫秒
        cut_point1 = int(point1 * 1000)
        cut_point2 = int(point2 * 1000)
        crossfade_duration = int(duration * 1000)
        
        # 确保裁剪点在有效范围内
        cut_point1 = min(cut_point1, len(audio1))
        cut_point2 = min(cut_point2, len(audio2))
        
        # 确保crossfade时长不超过音频长度
        crossfade_duration = min(
            crossfade_duration,
            len(audio1) - cut_point1,
            len(audio2) - cut_point2
        )
        
        # 裁剪音频
        part1 = audio1[:cut_point1]
        part2 = audio2[cut_point2:]
        
        # 应用crossfade
        if crossfade_duration > 0:
            result = part1.append(part2, crossfade=crossfade_duration)
        else:
            result = part1 + part2
        
        return result
    
    def _fallback_crossfade(
        self, 
        audio1_path: str, 
        audio2_path: str,
        duration_ms: int = 3000
    ) -> AudioSegment:
        """降级方案：普通淡化过渡"""
        audio1 = AudioSegment.from_file(audio1_path)
        audio2 = AudioSegment.from_file(audio2_path)
        
        return audio1.append(audio2, crossfade=duration_ms)
    
    def estimate_optimal_beats(self, tempo1: float, tempo2: float) -> int:
        """
        根据两段音频的BPM估算最佳过渡节拍数
        
        Args:
            tempo1: 第一段音频的BPM
            tempo2: 第二段音频的BPM
            
        Returns:
            推荐的过渡节拍数
        """
        # 计算BPM差异
        tempo_diff = abs(tempo1 - tempo2)
        tempo_ratio = tempo_diff / max(tempo1, tempo2)
        
        # 根据差异决定过渡长度
        if tempo_ratio < 0.05:
            # BPM非常接近，短过渡
            return 2
        elif tempo_ratio < 0.15:
            # BPM较接近，中等过渡
            return 4
        else:
            # BPM差异大，长过渡
            return 8
