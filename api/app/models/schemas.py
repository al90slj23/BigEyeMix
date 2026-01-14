from pydantic import BaseModel, Field
from typing import Optional

class MixRequest(BaseModel):
    track_a_id: str = Field(..., description="File ID of track A")
    track_b_id: str = Field(..., description="File ID of track B")
    track_a_start: float = Field(0, ge=0, description="Start time in seconds for track A")
    track_a_end: Optional[float] = Field(None, ge=0, description="End time in seconds for track A")
    track_b_start: float = Field(0, ge=0, description="Start time in seconds for track B")
    track_b_end: Optional[float] = Field(None, ge=0, description="End time in seconds for track B")
    target_duration: Optional[float] = Field(None, gt=0, description="Target total duration in seconds")
    transition_duration: float = Field(4.0, gt=0, le=10, description="Transition duration in seconds")

class AudioInfo(BaseModel):
    duration: float
    sample_rate: int
    channels: int
    format: str
