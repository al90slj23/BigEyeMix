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
    # 间隔块类型: ai_fill, silence, crossfade, beatmatch
    gap_type: Optional[str] = Field(None, description="Gap type for __gap__ segments")

class MultiMixRequest(BaseModel):
    segments: List[SegmentInfo] = Field(..., description="List of audio segments to mix")
    transition_duration: float = Field(2.0, ge=0, le=10, description="Transition duration between segments")
    transition_type: str = Field("crossfade", description="Type of transition: crossfade, cut, beatmatch")

class AIFillRequest(BaseModel):
    """AI 填充请求 - 生成两段音频之间的过渡"""
    audio_file_id: str = Field(..., description="源音频文件 ID")
    audio_start: float = Field(0, ge=0, description="截取开始时间")
    audio_end: float = Field(..., ge=0, description="截取结束时间")
    extend_duration: int = Field(5, ge=1, le=30, description="扩展时长（秒）")
    style_prompt: str = Field("", description="风格提示词")

class AudioInfo(BaseModel):
    duration: float
    sample_rate: int
    channels: int
    format: str
