import os
import uuid
import hashlib
from pydub import AudioSegment
from app.core.config import settings
import librosa
import numpy as np

class AudioService:
    def __init__(self):
        os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
        # Cache directory for converted files
        self.cache_dir = os.path.join(settings.OUTPUT_DIR, 'cache')
        os.makedirs(self.cache_dir, exist_ok=True)
        # Temp directory for segments
        self.temp_dir = os.path.join(settings.OUTPUT_DIR, 'temp')
        os.makedirs(self.temp_dir, exist_ok=True)
    
    def get_output_path(self, output_id: str) -> str:
        """Get output file path"""
        return os.path.join(settings.OUTPUT_DIR, output_id)
    
    async def extract_segment(self, file_path: str, start: float, end: float) -> str:
        """截取音频片段并保存为 MP3"""
        audio = AudioSegment.from_file(file_path)
        
        start_ms = int(start * 1000)
        end_ms = int(end * 1000)
        segment = audio[start_ms:end_ms]
        
        output_id = f"{uuid.uuid4()}.mp3"
        output_path = os.path.join(self.temp_dir, output_id)
        segment.export(output_path, format="mp3", bitrate="192k")
        
        return output_path
    
    async def get_browser_compatible_audio(self, file_path: str) -> str:
        """Convert audio to browser-compatible MP3 format, with caching"""
        # Generate cache key based on file path and modification time
        file_stat = os.stat(file_path)
        cache_key = hashlib.md5(f"{file_path}_{file_stat.st_mtime}".encode()).hexdigest()
        cache_path = os.path.join(self.cache_dir, f"{cache_key}.mp3")
        
        # Return cached version if exists
        if os.path.exists(cache_path):
            return cache_path
        
        # Convert to MP3
        audio = AudioSegment.from_file(file_path)
        audio.export(cache_path, format="mp3", bitrate="192k")
        
        return cache_path
    
    async def mix_tracks(
        self,
        track_a_id: str,
        track_b_id: str,
        track_a_start: float,
        track_a_end: float | None,
        track_b_start: float,
        track_b_end: float | None,
        target_duration: float | None,
        transition_duration: float
    ) -> str:
        """Mix two audio tracks with crossfade transition"""
        
        # Load audio files
        track_a_path = os.path.join(settings.UPLOAD_DIR, track_a_id)
        track_b_path = os.path.join(settings.UPLOAD_DIR, track_b_id)
        
        if not os.path.exists(track_a_path) or not os.path.exists(track_b_path):
            raise FileNotFoundError("One or both audio files not found")
        
        # Load with pydub
        audio_a = AudioSegment.from_file(track_a_path)
        audio_b = AudioSegment.from_file(track_b_path)
        
        # Extract segments (convert seconds to milliseconds)
        start_a_ms = int(track_a_start * 1000)
        end_a_ms = int(track_a_end * 1000) if track_a_end else len(audio_a)
        start_b_ms = int(track_b_start * 1000)
        end_b_ms = int(track_b_end * 1000) if track_b_end else len(audio_b)
        
        segment_a = audio_a[start_a_ms:end_a_ms]
        segment_b = audio_b[start_b_ms:end_b_ms]
        
        # Apply crossfade
        transition_ms = int(transition_duration * 1000)
        
        # Basic crossfade (will be enhanced with pyCrossfade later)
        mixed = segment_a.append(segment_b, crossfade=transition_ms)
        
        # Adjust to target duration if specified
        if target_duration:
            target_ms = int(target_duration * 1000)
            if len(mixed) > target_ms:
                mixed = mixed[:target_ms]
        
        # Export
        output_id = f"{uuid.uuid4()}.mp3"
        output_path = os.path.join(settings.OUTPUT_DIR, output_id)
        mixed.export(output_path, format="mp3", bitrate="320k")
        
        return output_path

    async def mix_multi_segments(
        self,
        segments: list,
        transition_duration: float,
        transition_type: str = "cut"
    ) -> str:
        """
        Mix multiple audio segments with transitions
        
        间隔块类型 (gap_type):
        - ai_fill: AI 填充过渡（需要调用 PiAPI）
        - silence: 静音间隔
        - crossfade: 淡入淡出（前段渐弱 + 后段渐强）
        """
        from app.services.piapi_service import piapi_service
        
        if not segments or len(segments) < 1:
            raise ValueError("At least one segment is required")
        
        mixed = None
        prev_segment = None  # 用于 AI 填充时获取前一段音频
        prev_file_id = None
        prev_end = 0
        
        for i, seg in enumerate(segments):
            # 处理间隔块
            if seg.file_id == '__gap__':
                gap_duration_ms = int(seg.end * 1000)
                gap_type = getattr(seg, 'gap_type', 'silence') or 'silence'
                
                if gap_type == 'ai_fill' and prev_segment is not None and i + 1 < len(segments):
                    # AI 填充：使用前一段音频的结尾生成过渡
                    try:
                        ai_segment = await self._generate_ai_transition(
                            prev_file_id,
                            prev_end,
                            int(seg.end)  # 扩展时长（秒）
                        )
                        if ai_segment:
                            # AI 生成的音频已经包含了过渡，直接拼接
                            # 但需要去掉原始音频部分，只保留扩展部分
                            # 这里简化处理：直接使用生成的音频作为过渡
                            segment = ai_segment
                        else:
                            # AI 失败，降级为静音
                            segment = AudioSegment.silent(duration=gap_duration_ms)
                    except Exception as e:
                        print(f"AI fill failed: {e}, falling back to silence")
                        segment = AudioSegment.silent(duration=gap_duration_ms)
                        
                elif gap_type == 'crossfade' and prev_segment is not None:
                    # 淡入淡出：前段渐弱
                    fade_duration = min(gap_duration_ms, len(prev_segment) // 2)
                    if mixed and fade_duration > 0:
                        # 对已混合的音频末尾应用淡出
                        mixed = mixed.fade_out(fade_duration)
                    # 添加静音间隔
                    segment = AudioSegment.silent(duration=gap_duration_ms)
                else:
                    # 静音间隔
                    segment = AudioSegment.silent(duration=gap_duration_ms)
            else:
                # 普通音频片段
                file_path = os.path.join(settings.UPLOAD_DIR, seg.file_id)
                if not os.path.exists(file_path):
                    raise FileNotFoundError(f"Audio file not found: {seg.file_id}")
                
                audio = AudioSegment.from_file(file_path)
                start_ms = int(seg.start * 1000)
                end_ms = int(seg.end * 1000)
                segment = audio[start_ms:end_ms]
                
                # 检查前一个是否是 crossfade 间隔，如果是则应用淡入
                if i > 0 and segments[i-1].file_id == '__gap__':
                    prev_gap_type = getattr(segments[i-1], 'gap_type', 'silence')
                    if prev_gap_type == 'crossfade':
                        fade_duration = min(int(segments[i-1].end * 1000), len(segment) // 2)
                        if fade_duration > 0:
                            segment = segment.fade_in(fade_duration)
                
                # 保存当前片段信息，供 AI 填充使用
                prev_segment = segment
                prev_file_id = seg.file_id
                prev_end = seg.end
            
            if mixed is None:
                mixed = segment
            else:
                mixed = mixed + segment
        
        # Export
        output_id = f"{uuid.uuid4()}.mp3"
        output_path = os.path.join(settings.OUTPUT_DIR, output_id)
        mixed.export(output_path, format="mp3", bitrate="320k")
        
        return output_path
    
    async def _generate_ai_transition(
        self,
        file_id: str,
        end_time: float,
        extend_duration: int
    ) -> AudioSegment | None:
        """
        使用 PiAPI ACE-Step 生成 AI 过渡音频
        
        Args:
            file_id: 源音频文件 ID
            end_time: 截取结束时间（秒）
            extend_duration: 扩展时长（秒）
        
        Returns:
            生成的过渡音频片段，或 None（失败时）
        """
        from app.services.piapi_service import piapi_service
        
        try:
            # 1. 截取源音频的最后 10 秒（或更短）
            file_path = os.path.join(settings.UPLOAD_DIR, file_id)
            audio = AudioSegment.from_file(file_path)
            
            # 取最后 10 秒作为参考
            ref_duration = min(10, end_time)
            start_time = max(0, end_time - ref_duration)
            
            segment_path = await self.extract_segment(file_path, start_time, end_time)
            segment_id = os.path.basename(segment_path)
            
            # 2. 生成公网 URL
            public_url = f"{settings.SERVER_PUBLIC_URL}/api/audio/{segment_id}"
            
            # 3. 调用 PiAPI 扩展
            result_url = await piapi_service.extend_audio(
                audio_url=public_url,
                right_extend_duration=extend_duration,
                style_prompt="smooth transition, same style",
                lyrics="[inst]"
            )
            
            # 4. 下载结果
            output_path = await piapi_service.download_audio(result_url, self.temp_dir)
            
            # 5. 加载并提取扩展部分（去掉原始音频）
            extended_audio = AudioSegment.from_file(output_path)
            
            # 原始片段长度
            original_length_ms = int(ref_duration * 1000)
            
            # 只取扩展的部分
            if len(extended_audio) > original_length_ms:
                transition_audio = extended_audio[original_length_ms:]
                return transition_audio
            else:
                return extended_audio
                
        except Exception as e:
            print(f"AI transition generation failed: {e}")
            return None
