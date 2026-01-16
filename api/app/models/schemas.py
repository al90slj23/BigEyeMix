from pydantic import BaseModel, Field
from typing import Optional, List

class MixRequest(BaseModel):
    track_a_id: str = Field(..., description="File ID of track A")
    track_b_id: str = Field(..., description="File ID of track B")
    track_a_start: float = Field(0, ge=0, description="Start time in seconds for track A")
    track_a_end: Optional[float] = Field(None, ge=0, description="End time in seconds for track A")
    track_b_start: float = Field(0, ge=0, description="Start time in seconds for track B")
    track_b_end: Optional[float] = Field(None, ge=0, description="End time in seconds for track B")
    target_duration: Optional[float] = Field(None, gt=0, description="Target total duration in seconds")
    transition_duration: float = Field(4.0, gt=0, le=10, description="Transition duration in seconds")

class SegmentInfo(BaseModel):
    file_id: str = Field(..., description="File ID of the audio")
    start: float = Field(0, ge=0, description="Start time in seconds")
    end: float = Field(..., ge=0, description="End time in seconds")
    # 过渡块类型: magicfill, silence, crossfade, beatsync
    transition_type: Optional[str] = Field(None, description="Transition type for __transition__ segments")
    # 兼容旧版 gap_type
    gap_type: Optional[str] = Field(None, description="Legacy: Gap type for __gap__ segments")

class MultiMixRequest(BaseModel):
    segments: List[SegmentInfo] = Field(..., description="List of audio segments to mix")
    transition_duration: float = Field(2.0, ge=0, le=10, description="Transition duration between segments")
    transition_type: str = Field("crossfade", description="Type of transition: crossfade, cut, beatsync")

class MagicFillRequest(BaseModel):
    """魔法填充请求 - 生成两段音频之间的过渡"""
    audio_file_id: str = Field(..., description="源音频文件 ID")
    audio_start: float = Field(0, ge=0, description="截取开始时间")
    audio_end: float = Field(..., ge=0, description="截取结束时间")
    extend_duration: int = Field(5, ge=1, le=30, description="扩展时长（秒）")
    style_prompt: str = Field("", description="风格提示词")

class BeatSyncRequest(BaseModel):
    """节拍对齐请求 - 在节拍点进行智能对齐和过渡"""
    audio1_file_id: str = Field(..., description="第一段音频文件 ID")
    audio1_start: float = Field(0, ge=0, description="第一段开始时间")
    audio1_end: float = Field(..., ge=0, description="第一段结束时间")
    audio2_file_id: str = Field(..., description="第二段音频文件 ID")
    audio2_start: float = Field(0, ge=0, description="第二段开始时间")
    audio2_end: float = Field(..., ge=0, description="第二段结束时间")
    transition_beats: int = Field(4, ge=1, le=16, description="过渡节拍数")

class AudioInfo(BaseModel):
    duration: float
    sample_rate: int
    channels: int
    format: str
