"""
过渡优化服务 - 智能分析和推荐最佳过渡方案
BigEyeMix 音频拼接过渡增强
"""
import librosa
import numpy as np
from pydub import AudioSegment
import logging
from typing import Dict, List, Tuple, Optional

logger = logging.getLogger(__name__)

class TransitionOptimizer:
    """过渡优化分析服务"""
    
    def __init__(self):
        self.transition_types = {
            'crossfade': {'priority': 1, 'name': '淡化过渡'},
            'beatsync': {'priority': 2, 'name': '节拍过渡'},
            'magicfill': {'priority': 3, 'name': '魔法填充'},
            'silence': {'priority': 4, 'name': '静音填充'}
        }
    
    async def analyze_compatibility(
        self,
        audio1_path: str,
        audio2_path: str,
        transition_type: str
    ) -> Dict:
        """
        分析两段音频的过渡兼容性
        
        Args:
            audio1_path: 第一段音频路径
            audio2_path: 第二段音频路径
            transition_type: 过渡类型
            
        Returns:
            兼容性分析结果
        """
        try:
            logger.info(f"分析过渡兼容性: {transition_type}")
            
            # 加载音频特征
            features1 = await self._extract_features(audio1_path)
            features2 = await self._extract_features(audio2_path)
            
            # 根据过渡类型分析
            if transition_type == 'beatsync':
                return self._analyze_beat_compatibility(features1, features2)
            elif transition_type == 'crossfade':
                return self._analyze_crossfade_compatibility(features1, features2)
            else:
                # magicfill 和 silence 总是兼容
                return {
                    'compatible': True,
                    'confidence': 1.0,
                    'recommendation': transition_type
                }
                
        except Exception as e:
            logger.error(f"兼容性分析失败: {str(e)}")
            return {
                'compatible': True,
                'confidence': 0.5,
                'recommendation': 'crossfade',
                'error': str(e)
            }
    
    async def _extract_features(self, audio_path: str) -> Dict:
        """提取音频特征"""
        try:
            # 加载音频（降采样）
            y, sr = librosa.load(audio_path, sr=22050, duration=30)  # 只分析前30秒
            
            # 检测节拍
            tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
            
            # 检测能量
            rms = librosa.feature.rms(y=y)[0]
            avg_energy = float(np.mean(rms))
            
            # 检测频谱质心（音色特征）
            spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
            avg_centroid = float(np.mean(spectral_centroid))
            
            # 检测零交叉率（节奏特征）
            zcr = librosa.feature.zero_crossing_rate(y)[0]
            avg_zcr = float(np.mean(zcr))
            
            return {
                'tempo': float(tempo),
                'beat_count': len(beats),
                'energy': avg_energy,
                'spectral_centroid': avg_centroid,
                'zero_crossing_rate': avg_zcr,
                'duration': len(y) / sr
            }
        except Exception as e:
            logger.error(f"特征提取失败: {str(e)}")
            return {
                'tempo': 120.0,
                'beat_count': 0,
                'energy': 0.1,
                'spectral_centroid': 1000.0,
                'zero_crossing_rate': 0.1,
                'duration': 0
            }
    
    def _analyze_beat_compatibility(
        self,
        features1: Dict,
        features2: Dict
    ) -> Dict:
        """分析节拍对齐兼容性"""
        tempo1 = features1['tempo']
        tempo2 = features2['tempo']
        
        # 计算 BPM 差异
        tempo_diff = abs(tempo1 - tempo2)
        tempo_ratio = tempo_diff / max(tempo1, tempo2)
        
        # 检查节拍数量
        has_beats1 = features1['beat_count'] > 0
        has_beats2 = features2['beat_count'] > 0
        
        if not has_beats1 or not has_beats2:
            # 无法检测节拍，不推荐 beatsync
            return {
                'compatible': False,
                'confidence': 0.3,
                'recommendation': 'crossfade',
                'reason': '无法检测到明显节拍',
                'tempo1': tempo1,
                'tempo2': tempo2
            }
        
        # 根据 BPM 差异判断兼容性
        if tempo_ratio < 0.05:
            # BPM 非常接近，强烈推荐 beatsync
            confidence = 0.95
            compatible = True
            reason = f'BPM 非常接近 ({tempo1:.1f} vs {tempo2:.1f})'
        elif tempo_ratio < 0.15:
            # BPM 较接近，推荐 beatsync
            confidence = 0.75
            compatible = True
            reason = f'BPM 较接近 ({tempo1:.1f} vs {tempo2:.1f})'
        elif tempo_ratio < 0.30:
            # BPM 有差异，可以尝试 beatsync
            confidence = 0.50
            compatible = True
            reason = f'BPM 有差异 ({tempo1:.1f} vs {tempo2:.1f})，可能需要较长过渡'
        else:
            # BPM 差异太大，不推荐 beatsync
            confidence = 0.25
            compatible = False
            reason = f'BPM 差异过大 ({tempo1:.1f} vs {tempo2:.1f})'
        
        return {
            'compatible': compatible,
            'confidence': confidence,
            'recommendation': 'beatsync' if compatible else 'crossfade',
            'reason': reason,
            'tempo1': tempo1,
            'tempo2': tempo2,
            'tempo_diff': tempo_diff,
            'optimal_beats': self._estimate_optimal_beats(tempo1, tempo2)
        }
    
    def _analyze_crossfade_compatibility(
        self,
        features1: Dict,
        features2: Dict
    ) -> Dict:
        """分析淡化过渡兼容性"""
        # 计算能量差异
        energy_diff = abs(features1['energy'] - features2['energy'])
        energy_ratio = energy_diff / max(features1['energy'], features2['energy'])
        
        # 计算音色差异
        centroid_diff = abs(features1['spectral_centroid'] - features2['spectral_centroid'])
        centroid_ratio = centroid_diff / max(features1['spectral_centroid'], features2['spectral_centroid'])
        
        # crossfade 几乎总是兼容的，但可以给出质量评估
        if energy_ratio < 0.3 and centroid_ratio < 0.3:
            confidence = 0.9
            reason = '音频特征相似，过渡效果好'
        elif energy_ratio < 0.5 and centroid_ratio < 0.5:
            confidence = 0.7
            reason = '音频特征有差异，过渡效果尚可'
        else:
            confidence = 0.5
            reason = '音频特征差异较大，建议使用较长过渡时间'
        
        return {
            'compatible': True,
            'confidence': confidence,
            'recommendation': 'crossfade',
            'reason': reason,
            'energy_diff': energy_diff,
            'centroid_diff': centroid_diff,
            'suggested_duration': self._suggest_crossfade_duration(energy_ratio, centroid_ratio)
        }
    
    def _estimate_optimal_beats(self, tempo1: float, tempo2: float) -> int:
        """估算最佳过渡节拍数"""
        tempo_diff = abs(tempo1 - tempo2)
        tempo_ratio = tempo_diff / max(tempo1, tempo2)
        
        if tempo_ratio < 0.05:
            return 2  # 短过渡
        elif tempo_ratio < 0.15:
            return 4  # 中等过渡
        else:
            return 8  # 长过渡
    
    def _suggest_crossfade_duration(self, energy_ratio: float, centroid_ratio: float) -> float:
        """建议淡化过渡时长"""
        avg_diff = (energy_ratio + centroid_ratio) / 2
        
        if avg_diff < 0.2:
            return 2.0  # 短过渡
        elif avg_diff < 0.4:
            return 3.0  # 中等过渡
        else:
            return 5.0  # 长过渡
    
    async def recommend_transition(
        self,
        audio1_path: str,
        audio2_path: str,
        user_preference: Optional[str] = None
    ) -> Dict:
        """
        推荐最佳过渡方案
        
        Args:
            audio1_path: 第一段音频路径
            audio2_path: 第二段音频路径
            user_preference: 用户偏好的过渡类型（可选）
            
        Returns:
            推荐结果
        """
        try:
            # 如果用户指定了类型，直接分析该类型
            if user_preference and user_preference in ['beatsync', 'crossfade']:
                result = await self.analyze_compatibility(
                    audio1_path,
                    audio2_path,
                    user_preference
                )
                result['user_preference'] = user_preference
                return result
            
            # 否则，分析所有类型并推荐最佳
            beatsync_result = await self.analyze_compatibility(
                audio1_path,
                audio2_path,
                'beatsync'
            )
            
            crossfade_result = await self.analyze_compatibility(
                audio1_path,
                audio2_path,
                'crossfade'
            )
            
            # 选择置信度最高的
            if beatsync_result['confidence'] > crossfade_result['confidence']:
                recommended = beatsync_result
                recommended['alternatives'] = [crossfade_result]
            else:
                recommended = crossfade_result
                recommended['alternatives'] = [beatsync_result]
            
            return recommended
            
        except Exception as e:
            logger.error(f"推荐失败: {str(e)}")
            return {
                'compatible': True,
                'confidence': 0.5,
                'recommendation': 'crossfade',
                'reason': '分析失败，使用默认方案',
                'error': str(e)
            }


transition_optimizer = TransitionOptimizer()
