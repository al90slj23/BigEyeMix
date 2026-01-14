import os
import uuid
import aiofiles
from fastapi import UploadFile
from app.core.config import settings
import librosa

class FileService:
    def __init__(self):
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    
    async def save_upload(self, file: UploadFile) -> str:
        """Save uploaded file and return file path"""
        # Validate file extension
        ext = file.filename.split('.')[-1].lower()
        if ext not in settings.allowed_extensions_list:
            raise ValueError(f"File type .{ext} not allowed")
        
        # Generate unique filename
        file_id = f"{uuid.uuid4()}.{ext}"
        file_path = os.path.join(settings.UPLOAD_DIR, file_id)
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            if len(content) > settings.MAX_UPLOAD_SIZE:
                raise ValueError("File size exceeds maximum allowed size")
            await f.write(content)
        
        return file_path
    
    async def get_audio_info(self, file_path: str) -> dict:
        """Get audio file information"""
        try:
            y, sr = librosa.load(file_path, sr=None)
            duration = librosa.get_duration(y=y, sr=sr)
            
            return {
                "duration": round(duration, 2),
                "sample_rate": sr,
                "channels": 1 if len(y.shape) == 1 else y.shape[0],
                "format": file_path.split('.')[-1]
            }
        except Exception as e:
            raise ValueError(f"Failed to read audio file: {str(e)}")
    
    async def delete_file(self, file_id: str):
        """Delete uploaded file"""
        file_path = os.path.join(settings.UPLOAD_DIR, file_id)
        if os.path.exists(file_path):
            os.remove(file_path)
        else:
            raise FileNotFoundError(f"File {file_id} not found")
