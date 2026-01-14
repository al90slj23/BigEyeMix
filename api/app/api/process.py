from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from app.models.schemas import MixRequest, MultiMixRequest, AIFillRequest
from app.services.audio_service import AudioService
from app.services.piapi_service import piapi_service
from app.core.config import settings
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

@router.post("/mix/multi")
async def create_multi_mix(request: MultiMixRequest):
    """Create a mixed audio file from multiple segments"""
    try:
        output_path = await audio_service.mix_multi_segments(
            segments=request.segments,
            transition_duration=request.transition_duration,
            transition_type=request.transition_type
        )
        
        return {
            "success": True,
            "output_id": os.path.basename(output_path),
            "message": "Mix created successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/mix/preview")
async def create_preview(request: MultiMixRequest):
    """Create a preview mix (same as multi but returns preview_id)"""
    try:
        output_path = await audio_service.mix_multi_segments(
            segments=request.segments,
            transition_duration=request.transition_duration or 0,
            transition_type=request.transition_type or 'cut'
        )
        
        return {
            "success": True,
            "preview_id": os.path.basename(output_path),
            "message": "Preview created successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/audio/{file_id}")
async def stream_audio(file_id: str):
    """Stream audio file for waveform display (converts to MP3 for browser compatibility)"""
    # Check uploads directory first
    file_path = os.path.join(settings.UPLOAD_DIR, file_id)
    
    # If not in uploads, check outputs (for preview)
    if not os.path.exists(file_path):
        file_path = os.path.join(settings.OUTPUT_DIR, file_id)
    
    # If not in outputs, check temp (for AI fill segments)
    if not os.path.exists(file_path):
        file_path = os.path.join(settings.OUTPUT_DIR, 'temp', file_id)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    ext = os.path.splitext(file_id)[1].lower()
    
    # Browser-compatible formats
    browser_compatible = ['.mp3', '.wav', '.ogg', '.m4a', '.aac']
    
    if ext in browser_compatible:
        # Stream directly
        def iterfile():
            with open(file_path, "rb") as f:
                while chunk := f.read(65536):
                    yield chunk
        
        media_types = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.m4a': 'audio/mp4',
            '.aac': 'audio/aac',
            '.ogg': 'audio/ogg'
        }
        media_type = media_types.get(ext, 'audio/mpeg')
        
        return StreamingResponse(
            iterfile(),
            media_type=media_type,
            headers={"Accept-Ranges": "bytes"}
        )
    else:
        # Convert FLAC/other formats to MP3 for browser playback
        converted_path = await audio_service.get_browser_compatible_audio(file_path)
        
        def iterfile():
            with open(converted_path, "rb") as f:
                while chunk := f.read(65536):
                    yield chunk
        
        return StreamingResponse(
            iterfile(),
            media_type="audio/mpeg",
            headers={"Accept-Ranges": "bytes"}
        )

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


@router.post("/ai/fill")
async def ai_fill_transition(request: AIFillRequest):
    """
    AI 填充过渡 - 使用 PiAPI ACE-Step 生成音频过渡
    
    流程：
    1. 截取源音频片段（片段 A 的结尾部分）
    2. 保存到 temp 目录，生成公网可访问的 URL
    3. 调用 PiAPI extend 向右扩展生成过渡音频
    4. 下载结果并返回
    """
    try:
        # 1. 获取源音频文件
        file_path = os.path.join(settings.UPLOAD_DIR, request.audio_file_id)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        # 2. 截取片段并保存
        segment_path = await audio_service.extract_segment(
            file_path,
            request.audio_start,
            request.audio_end
        )
        segment_id = os.path.basename(segment_path)
        
        # 3. 生成公网可访问的 URL
        # 临时文件放在 outputs/temp 目录，通过 /api/audio/ 访问
        public_url = f"{settings.SERVER_PUBLIC_URL}/api/audio/{segment_id}"
        
        # 4. 调用 PiAPI 扩展音频
        result_url = await piapi_service.extend_audio(
            audio_url=public_url,
            right_extend_duration=request.extend_duration,
            style_prompt=request.style_prompt or "smooth transition",
            lyrics="[inst]"
        )
        
        # 5. 下载结果到本地
        output_path = await piapi_service.download_audio(result_url, settings.OUTPUT_DIR)
        output_id = os.path.basename(output_path)
        
        return {
            "success": True,
            "output_id": output_id,
            "source_segment_id": segment_id,
            "piapi_url": result_url,
            "message": "AI fill transition created successfully"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/test")
async def test_piapi():
    """测试 PiAPI 连接"""
    try:
        # 使用文本生成测试
        headers = {
            "X-API-Key": settings.PIAPI_KEY,
            "Content-Type": "application/json"
        }
        
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            # 简单测试 API 连通性
            response = await client.post(
                f"{settings.PIAPI_BASE_URL}/api/v1/task",
                headers=headers,
                json={
                    "model": "Qubico/ace-step",
                    "task_type": "txt2audio",
                    "input": {
                        "style_prompt": "test",
                        "lyrics": "[inst]",
                        "duration": 5
                    }
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                task_id = result.get("data", {}).get("task_id")
                return {
                    "success": True,
                    "message": "PiAPI connection successful",
                    "task_id": task_id
                }
            else:
                return {
                    "success": False,
                    "message": f"API returned {response.status_code}",
                    "detail": response.text
                }
    except Exception as e:
        return {
            "success": False,
            "message": str(e)
        }
