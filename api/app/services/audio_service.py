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
        
        过渡块类型 (transition_type):
        - magicfill: 魔法填充过渡（需要调用 PiAPI）
        - silence: 静音过渡
        - crossfade: 淡入淡出（前段渐弱 + 后段渐强）
        - beatsync: 根据节奏（基于BPM节拍对齐）
        """
        from app.services.piapi_service import piapi_service
        from app.services.beat_sync_service import BeatSyncService
        
        beat_sync_service = BeatSyncService()
        
        if not segments or len(segments) < 1:
            raise ValueError("At least one segment is required")
        
        mixed = None
        prev_segment = None  # 用于魔法填充时获取前一段音频
        prev_file_id = None
        prev_end = 0
        
        for i, seg in enumerate(segments):
            # 处理过渡块
            if seg.file_id == '__transition__' or seg.file_id == '__gap__':
                trans_duration_ms = int(seg.end * 1000)
                trans_type = getattr(seg, 'transition_type', None) or getattr(seg, 'gap_type', 'silence') or 'silence'
                
                if trans_type == 'magicfill' and prev_segment is not None and i + 1 < len(segments):
                    # 魔法填充：使用前一段音频的结尾生成过渡
                    try:
                        magic_segment = await self._generate_magic_transition(
                            prev_file_id,
                            prev_end,
                            int(seg.end)  # 扩展时长（秒）
                        )
                        if magic_segment:
                            segment = magic_segment
                        else:
                            # 魔法填充失败，降级为静音
                            segment = AudioSegment.silent(duration=trans_duration_ms)
                    except Exception as e:
                        print(f"Magic fill failed: {e}, falling back to silence")
                        segment = AudioSegment.silent(duration=trans_duration_ms)
                
                elif trans_type == 'beatsync' and prev_segment is not None and i + 1 < len(segments):
                    # 节拍对齐：使用智能节拍检测
                    try:
                        # 获取前一段和下一段的文件路径
                        prev_seg = segments[i - 1]
                        next_seg = segments[i + 1]
                        
                        if prev_seg.file_id != '__transition__' and next_seg.file_id != '__transition__':
                            prev_path = os.path.join(settings.UPLOAD_DIR, prev_seg.file_id)
                            next_path = os.path.join(settings.UPLOAD_DIR, next_seg.file_id)
                            
                            # 截取片段
                            prev_segment_path = await self.extract_segment(prev_path, prev_seg.start, prev_seg.end)
                            next_segment_path = await self.extract_segment(next_path, next_seg.start, next_seg.end)
                            
                            # 执行节拍对齐
                            transition_beats = max(2, int(seg.end / 0.5))  # 根据时长估算节拍数
                            result_audio, sync_info = await beat_sync_service.sync_and_transition(
                                prev_segment_path,
                                next_segment_path,
                                transition_beats
                            )
                            
                            # 使用对齐后的音频替换原有的前后片段
                            # 注意：这里需要重新构建混合逻辑
                            # 暂时降级为普通 crossfade
                            segment = AudioSegment.silent(duration=trans_duration_ms)
                            print(f"Beat sync info: {sync_info}")
                        else:
                            segment = AudioSegment.silent(duration=trans_duration_ms)
                    except Exception as e:
                        print(f"Beat sync failed: {e}, falling back to silence")
                        segment = AudioSegment.silent(duration=trans_duration_ms)
                        
                elif trans_type == 'crossfade' and prev_segment is not None:
                    # 淡入淡出：前段渐弱
                    fade_duration = min(trans_duration_ms, len(prev_segment) // 2)
                    if mixed and fade_duration > 0:
                        # 对已混合的音频末尾应用淡出
                        mixed = mixed.fade_out(fade_duration)
                    # 添加静音过渡
                    segment = AudioSegment.silent(duration=trans_duration_ms)
                else:
                    # 静音过渡
                    segment = AudioSegment.silent(duration=trans_duration_ms)
            else:
                # 普通音频片段
                file_path = os.path.join(settings.UPLOAD_DIR, seg.file_id)
                if not os.path.exists(file_path):
                    raise FileNotFoundError(f"Audio file not found: {seg.file_id}")
                
                audio = AudioSegment.from_file(file_path)
                start_ms = int(seg.start * 1000)
                end_ms = int(seg.end * 1000)
                segment = audio[start_ms:end_ms]
                
                # 检查前一个是否是 crossfade 过渡，如果是则应用淡入
                if i > 0 and (segments[i-1].file_id == '__transition__' or segments[i-1].file_id == '__gap__'):
                    prev_trans_type = getattr(segments[i-1], 'transition_type', None) or getattr(segments[i-1], 'gap_type', 'silence')
                    if prev_trans_type == 'crossfade':
                        fade_duration = min(int(segments[i-1].end * 1000), len(segment) // 2)
                        if fade_duration > 0:
                            segment = segment.fade_in(fade_duration)
                
                # 保存当前片段信息，供魔法填充使用
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
    
    async def _generate_magic_transition(
        self,
        file_id: str,
        end_time: float,
        extend_duration: int
    ) -> AudioSegment | None:
        """
        使用 PiAPI ACE-Step 生成魔法填充过渡音频
        
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
            print(f"Magic transition generation failed: {e}")
            return None

    def _generate_beat_sync_transition(
        self,
        prev_segment: AudioSegment,
        trans_duration_ms: int
    ) -> AudioSegment:
        """
        根据节奏生成过渡音频
        
        使用 librosa 检测前一段音频的 BPM，然后生成节拍对齐的过渡
        通过循环前一段的最后几个节拍来填充过渡
        
        Args:
            prev_segment: 前一段音频
            trans_duration_ms: 过渡时长（毫秒）
        
        Returns:
            节拍对齐的过渡音频
        """
        try:
            # 将 pydub AudioSegment 转换为 numpy 数组供 librosa 使用
            samples = np.array(prev_segment.get_array_of_samples())
            
            # 如果是立体声，转换为单声道
            if prev_segment.channels == 2:
                samples = samples.reshape((-1, 2)).mean(axis=1)
            
            # 归一化
            samples = samples.astype(np.float32) / 32768.0
            sr = prev_segment.frame_rate
            
            # 使用 librosa 检测 BPM 和节拍位置
            tempo, beat_frames = librosa.beat.beat_track(y=samples, sr=sr)
            
            # 将节拍帧转换为时间（秒）
            beat_times = librosa.frames_to_time(beat_frames, sr=sr)
            
            if len(beat_times) < 2:
                # 节拍太少，降级为静音
                return AudioSegment.silent(duration=trans_duration_ms)
            
            # 计算平均节拍间隔
            beat_interval_ms = int(np.mean(np.diff(beat_times)) * 1000)
            
            if beat_interval_ms <= 0:
                return AudioSegment.silent(duration=trans_duration_ms)
            
            # 取最后 2-4 个节拍的音频作为循环素材
            num_beats = min(4, len(beat_times) - 1)
            loop_start_time = beat_times[-num_beats - 1]
            loop_end_time = beat_times[-1]
            
            loop_start_ms = int(loop_start_time * 1000)
            loop_end_ms = int(loop_end_time * 1000)
            
            # 确保范围有效
            loop_start_ms = max(0, loop_start_ms)
            loop_end_ms = min(len(prev_segment), loop_end_ms)
            
            if loop_end_ms <= loop_start_ms:
                return AudioSegment.silent(duration=trans_duration_ms)
            
            # 提取循环片段
            loop_segment = prev_segment[loop_start_ms:loop_end_ms]
            
            # 应用淡入淡出使循环更平滑
            fade_ms = min(50, len(loop_segment) // 4)
            if fade_ms > 0:
                loop_segment = loop_segment.fade_in(fade_ms).fade_out(fade_ms)
            
            # 循环填充到目标时长
            result = AudioSegment.empty()
            while len(result) < trans_duration_ms:
                result += loop_segment
            
            # 裁剪到精确时长
            result = result[:trans_duration_ms]
            
            # 整体淡出，使过渡更自然
            fade_out_ms = min(200, trans_duration_ms // 2)
            if fade_out_ms > 0:
                result = result.fade_out(fade_out_ms)
            
            return result
            
        except Exception as e:
            print(f"Beat sync generation failed: {e}")
            return AudioSegment.silent(duration=trans_duration_ms)


audio_service = AudioService()
