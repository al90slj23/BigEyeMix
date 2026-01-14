from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.models.schemas import MixRequest
from app.services.audio_service import AudioService
import os

router = APIRouter()
audio_service = AudioService()

@router.post("/mix")
async def create_mix(request: MixRequest):
    """Create a mixed audio file from two tracks"""
    try:
        output_path = await audio_service.mix_tracks(
            track_a_id=request.track_a_id,
            track_b_id=request.track_b_id,
            track_a_start=request.track_a_start,
            track_a_end=request.track_a_end,
            track_b_start=request.track_b_start,
            track_b_end=request.track_b_end,
            target_duration=request.target_duration,
            transition_duration=request.transition_duration
        )
        
        return {
            "success": True,
            "output_id": os.path.basename(output_path),
            "message": "Mix created successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/download/{output_id}")
async def download_mix(output_id: str):
    """Download the mixed audio file"""
    try:
        file_path = audio_service.get_output_path(output_id)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")
        
        return FileResponse(
            file_path,
            media_type="audio/mpeg",
            filename=output_id
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
