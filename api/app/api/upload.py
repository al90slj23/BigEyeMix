from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.file_service import FileService
import os

router = APIRouter()
file_service = FileService()

@router.post("/upload")
async def upload_audio(file: UploadFile = File(...)):
    """Upload an audio file"""
    try:
        file_path = await file_service.save_upload(file)
        file_info = await file_service.get_audio_info(file_path)
        
        return {
            "success": True,
            "file_id": os.path.basename(file_path),
            "filename": file.filename,
            "info": file_info
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/upload/{file_id}")
async def delete_upload(file_id: str):
    """Delete an uploaded file"""
    try:
        await file_service.delete_file(file_id)
        return {"success": True, "message": "File deleted"}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
