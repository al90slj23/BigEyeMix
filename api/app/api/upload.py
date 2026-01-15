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

@router.get("/uploads")
async def list_uploads():
    """Get list of uploaded files (history)"""
    try:
        files = await file_service.get_history_files()
        return {
            "success": True,
            "files": files
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/uploads/{file_id}/info")
async def get_upload_info(file_id: str):
    """Get audio info for an uploaded file"""
    try:
        from app.core.config import settings
        file_path = os.path.join(settings.UPLOAD_DIR, file_id)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")
        
        file_info = await file_service.get_audio_info(file_path)
        return {
            "success": True,
            "file_id": file_id,
            "info": file_info
        }
    except HTTPException:
        raise
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

@router.get("/uploads/{file_id}/waveform")
async def get_waveform(file_id: str):
    """获取预计算的波形数据"""
    try:
        from app.core.config import settings
        import json
        
        file_path = os.path.join(settings.UPLOAD_DIR, file_id)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")
        
        waveform_path = file_service.get_waveform_path(file_path)
        
        if waveform_path and os.path.exists(waveform_path):
            with open(waveform_path, 'r') as f:
                data = json.load(f)
            return {
                "success": True,
                "file_id": file_id,
                "cached": True,
                **data
            }
        else:
            # 波形数据不存在，触发生成
            await file_service._preprocess_audio(file_path)
            waveform_path = file_service.get_waveform_path(file_path)
            
            if waveform_path and os.path.exists(waveform_path):
                with open(waveform_path, 'r') as f:
                    data = json.load(f)
                return {
                    "success": True,
                    "file_id": file_id,
                    "cached": False,
                    **data
                }
            else:
                raise HTTPException(status_code=500, detail="Failed to generate waveform")
                
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
