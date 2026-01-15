import os
import uuid
import hashlib
import json
import aiofiles
from fastapi import UploadFile
from pydub import AudioSegment
from app.core.config import settings
import librosa
import numpy as np
from datetime import datetime

class FileService:
    MAX_HISTORY_FILES = 10
    WAVEFORM_SAMPLES = 800  # 波形采样点数
    
    def __init__(self):
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
        # 缓存目录
        self.cache_dir = os.path.join(settings.OUTPUT_DIR, 'cache')
        os.makedirs(self.cache_dir, exist_ok=True)
        # MD5 index file
        self.md5_index_path = os.path.join(settings.UPLOAD_DIR, '.md5_index')
        self.md5_index = self._load_md5_index()
    
    def _load_md5_index(self) -> dict:
        """Load MD5 index from file"""
        index = {}
        if os.path.exists(self.md5_index_path):
            try:
                with open(self.md5_index_path, 'r') as f:
                    for line in f:
                        parts = line.strip().split('|')
                        if len(parts) == 2:
                            md5, file_id = parts
                            # Only keep if file still exists
                            if os.path.exists(os.path.join(settings.UPLOAD_DIR, file_id)):
                                index[md5] = file_id
            except:
                pass
        return index
    
    def _save_md5_index(self):
        """Save MD5 index to file"""
        try:
            with open(self.md5_index_path, 'w') as f:
                for md5, file_id in self.md5_index.items():
                    f.write(f"{md5}|{file_id}\n")
        except:
            pass
    
    def _calculate_md5(self, content: bytes) -> str:
        """Calculate MD5 hash of content"""
        return hashlib.md5(content).hexdigest()
    
    async def save_upload(self, file: UploadFile) -> str:
        """Save uploaded file and return file path (with MD5 deduplication)"""
        # Validate file extension
        ext = file.filename.split('.')[-1].lower()
        if ext not in settings.allowed_extensions_list:
            raise ValueError(f"File type .{ext} not allowed")
        
        # Read content
        content = await file.read()
        if len(content) > settings.MAX_UPLOAD_SIZE:
            raise ValueError("File size exceeds maximum allowed size")
        
        # Calculate MD5
        file_md5 = self._calculate_md5(content)
        
        # Generate new filename
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        safe_name = "".join(c for c in file.filename.rsplit('.', 1)[0] if c.isalnum() or c in '._- ')[:50]
        new_file_id = f"{timestamp}_{safe_name}.{ext}"
        new_file_path = os.path.join(settings.UPLOAD_DIR, new_file_id)
        
        # Check if file with same MD5 already exists
        if file_md5 in self.md5_index:
            existing_file_id = self.md5_index[file_md5]
            existing_path = os.path.join(settings.UPLOAD_DIR, existing_file_id)
            
            # Check if filename is the same (ignore timestamp prefix)
            existing_name = self._extract_original_name(existing_file_id)
            new_name = self._extract_original_name(new_file_id)
            
            if existing_name == new_name and os.path.exists(existing_path):
                # Same file, same name - just update modification time
                os.utime(existing_path, None)
                return existing_path
            else:
                # Same file, different name - delete old, save new
                if os.path.exists(existing_path):
                    try:
                        os.remove(existing_path)
                    except:
                        pass
        
        # Save new file
        async with aiofiles.open(new_file_path, 'wb') as f:
            await f.write(content)
        
        # Update MD5 index
        self.md5_index[file_md5] = new_file_id
        self._save_md5_index()
        
        # 预处理：转换为 MP3 + 生成波形数据
        await self._preprocess_audio(new_file_path)
        
        # Cleanup old files
        await self.cleanup_old_files()
        
        return new_file_path
    
    async def _preprocess_audio(self, file_path: str):
        """预处理音频：转换为 MP3 缓存 + 生成波形数据"""
        try:
            file_id = os.path.basename(file_path)
            ext = file_id.split('.')[-1].lower()
            
            # 生成缓存 key
            file_stat = os.stat(file_path)
            cache_key = hashlib.md5(f"{file_path}_{file_stat.st_mtime}".encode()).hexdigest()
            
            # 1. 非 MP3 格式转换为 MP3
            if ext not in ['mp3']:
                mp3_cache_path = os.path.join(self.cache_dir, f"{cache_key}.mp3")
                if not os.path.exists(mp3_cache_path):
                    audio = AudioSegment.from_file(file_path)
                    audio.export(mp3_cache_path, format="mp3", bitrate="192k")
            
            # 2. 生成波形数据
            waveform_path = os.path.join(self.cache_dir, f"{cache_key}.waveform.json")
            if not os.path.exists(waveform_path):
                await self._generate_waveform(file_path, waveform_path)
                
        except Exception as e:
            print(f"Preprocess audio failed: {e}")
    
    async def _generate_waveform(self, file_path: str, output_path: str):
        """生成波形数据 JSON"""
        try:
            # 加载音频
            y, sr = librosa.load(file_path, sr=22050, mono=True)
            duration = librosa.get_duration(y=y, sr=sr)
            
            # 计算每个采样点对应的样本数
            samples_per_point = len(y) // self.WAVEFORM_SAMPLES
            
            if samples_per_point < 1:
                samples_per_point = 1
            
            # 生成波形数据（取每段的最大绝对值）
            waveform = []
            for i in range(self.WAVEFORM_SAMPLES):
                start = i * samples_per_point
                end = min(start + samples_per_point, len(y))
                if start < len(y):
                    segment = y[start:end]
                    # 归一化到 0-1
                    peak = float(np.max(np.abs(segment)))
                    waveform.append(round(peak, 4))
                else:
                    waveform.append(0)
            
            # 保存为 JSON
            data = {
                "duration": round(duration, 2),
                "sample_rate": sr,
                "samples": self.WAVEFORM_SAMPLES,
                "waveform": waveform
            }
            
            with open(output_path, 'w') as f:
                json.dump(data, f)
                
        except Exception as e:
            print(f"Generate waveform failed: {e}")
    
    def get_waveform_path(self, file_path: str) -> str | None:
        """获取波形数据文件路径"""
        try:
            file_stat = os.stat(file_path)
            cache_key = hashlib.md5(f"{file_path}_{file_stat.st_mtime}".encode()).hexdigest()
            waveform_path = os.path.join(self.cache_dir, f"{cache_key}.waveform.json")
            if os.path.exists(waveform_path):
                return waveform_path
        except:
            pass
        return None
    
    def get_mp3_cache_path(self, file_path: str) -> str | None:
        """获取 MP3 缓存文件路径"""
        try:
            file_stat = os.stat(file_path)
            cache_key = hashlib.md5(f"{file_path}_{file_stat.st_mtime}".encode()).hexdigest()
            mp3_path = os.path.join(self.cache_dir, f"{cache_key}.mp3")
            if os.path.exists(mp3_path):
                return mp3_path
        except:
            pass
        return None
    
    async def cleanup_old_files(self):
        """Keep only the most recent MAX_HISTORY_FILES files"""
        files = []
        for f in os.listdir(settings.UPLOAD_DIR):
            file_path = os.path.join(settings.UPLOAD_DIR, f)
            if os.path.isfile(file_path):
                files.append((file_path, os.path.getmtime(file_path)))
        
        # Sort by modification time, newest first
        files.sort(key=lambda x: x[1], reverse=True)
        
        # Delete old files
        for file_path, _ in files[self.MAX_HISTORY_FILES:]:
            try:
                os.remove(file_path)
            except:
                pass
    
    async def get_history_files(self) -> list:
        """Get list of uploaded files"""
        files = []
        for f in os.listdir(settings.UPLOAD_DIR):
            file_path = os.path.join(settings.UPLOAD_DIR, f)
            if os.path.isfile(file_path):
                stat = os.stat(file_path)
                files.append({
                    "file_id": f,
                    "filename": self._extract_original_name(f),
                    "size": stat.st_size,
                    "created_at": stat.st_mtime
                })
        
        # Sort by creation time, newest first
        files.sort(key=lambda x: x["created_at"], reverse=True)
        return files[:self.MAX_HISTORY_FILES]
    
    def _extract_original_name(self, file_id: str) -> str:
        """Extract original filename from file_id"""
        # Format: 20250115123456_originalname.ext
        parts = file_id.split('_', 1)
        if len(parts) > 1:
            return parts[1]
        return file_id
    
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
