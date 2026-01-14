import os
import uuid
from pydub import AudioSegment
from app.core.config import settings
import librosa
import numpy as np

class AudioService:
    def __init__(self):
        os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    
    def get_output_path(self, output_id: str) -> str:
        """Get output file path"""
        return os.path.join(settings.OUTPUT_DIR, output_id)
    
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
