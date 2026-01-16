from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from app.models.schemas import MixRequest, MultiMixRequest, MagicFillRequest, BeatSyncRequest
from app.services.audio_service import AudioService
from app.services.piapi_service import piapi_service
from app.services.beat_sync_service import BeatSyncService
from app.services.transition_optimizer import transition_optimizer
from app.core.config import settings
import os
import uuid

router = APIRouter()
audio_service = AudioService()
beat_sync_service = BeatSyncService()

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
    """Create a preview mix with pre-computed waveform data"""
    try:
        from app.services.file_service import file_service
        import json
        
        output_path = await audio_service.mix_multi_segments(
            segments=request.segments,
            transition_duration=request.transition_duration or 0,
            transition_type=request.transition_type or 'cut'
        )
        
        preview_id = os.path.basename(output_path)
        
        # 生成预览波形数据
        waveform_data = None
        try:
            await file_service._preprocess_audio(output_path)
            waveform_path = file_service.get_waveform_path(output_path)
            if waveform_path and os.path.exists(waveform_path):
                with open(waveform_path, 'r') as f:
                    raw_data = json.load(f)
                    # 转换为前端期望的格式
                    waveform_data = {
                        "peaks": raw_data.get("waveform", []),
                        "duration": raw_data.get("duration", 0)
                    }
        except Exception as e:
            print(f"Failed to generate preview waveform: {e}")
        
        return {
            "success": True,
            "preview_id": preview_id,
            "waveform": waveform_data,
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


@router.post("/magic/fill")
async def magic_fill_transition(request: MagicFillRequest):
    """
    魔法填充过渡 - 使用 PiAPI ACE-Step 生成音频过渡
    
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
            "message": "Magic fill transition created successfully"
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


@router.post("/beatsync/process")
async def beatsync_transition(request: BeatSyncRequest):
    """
    节拍对齐过渡 - 使用智能节拍检测进行对齐
    
    流程：
    1. 截取两段音频片段
    2. 检测节拍和 BPM
    3. 在节拍点进行对齐和过渡
    4. 返回处理后的音频
    """
    try:
        # 1. 获取源音频文件
        file1_path = os.path.join(settings.UPLOAD_DIR, request.audio1_file_id)
        file2_path = os.path.join(settings.UPLOAD_DIR, request.audio2_file_id)
        
        if not os.path.exists(file1_path):
            raise HTTPException(status_code=404, detail=f"Audio file not found: {request.audio1_file_id}")
        if not os.path.exists(file2_path):
            raise HTTPException(status_code=404, detail=f"Audio file not found: {request.audio2_file_id}")
        
        # 2. 截取片段
        segment1_path = await audio_service.extract_segment(
            file1_path,
            request.audio1_start,
            request.audio1_end
        )
        
        segment2_path = await audio_service.extract_segment(
            file2_path,
            request.audio2_start,
            request.audio2_end
        )
        
        # 3. 执行节拍对齐
        result_audio, sync_info = await beat_sync_service.sync_and_transition(
            segment1_path,
            segment2_path,
            request.transition_beats
        )
        
        # 4. 保存结果
        output_id = f"{uuid.uuid4()}.mp3"
        output_path = os.path.join(settings.OUTPUT_DIR, output_id)
        result_audio.export(output_path, format="mp3", bitrate="320k")
        
        return {
            "success": sync_info.get('success', True),
            "output_id": output_id,
            "sync_info": sync_info,
            "message": "Beat sync transition created successfully"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transition/analyze")
async def analyze_transition_compatibility(
    audio1_file_id: str,
    audio2_file_id: str,
    transition_type: str = "beatsync"
):
    """
    分析两段音频的过渡兼容性
    
    Args:
        audio1_file_id: 第一段音频文件 ID
        audio2_file_id: 第二段音频文件 ID
        transition_type: 过渡类型 (beatsync, crossfade)
    """
    try:
        file1_path = os.path.join(settings.UPLOAD_DIR, audio1_file_id)
        file2_path = os.path.join(settings.UPLOAD_DIR, audio2_file_id)
        
        if not os.path.exists(file1_path):
            raise HTTPException(status_code=404, detail=f"Audio file not found: {audio1_file_id}")
        if not os.path.exists(file2_path):
            raise HTTPException(status_code=404, detail=f"Audio file not found: {audio2_file_id}")
        
        result = await transition_optimizer.analyze_compatibility(
            file1_path,
            file2_path,
            transition_type
        )
        
        return {
            "success": True,
            "analysis": result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transition/recommend")
async def recommend_transition(
    audio1_file_id: str,
    audio2_file_id: str,
    user_preference: str = None
):
    """
    推荐最佳过渡方案
    
    Args:
        audio1_file_id: 第一段音频文件 ID
        audio2_file_id: 第二段音频文件 ID
        user_preference: 用户偏好的过渡类型（可选）
    """
    try:
        file1_path = os.path.join(settings.UPLOAD_DIR, audio1_file_id)
        file2_path = os.path.join(settings.UPLOAD_DIR, audio2_file_id)
        
        if not os.path.exists(file1_path):
            raise HTTPException(status_code=404, detail=f"Audio file not found: {audio1_file_id}")
        if not os.path.exists(file2_path):
            raise HTTPException(status_code=404, detail=f"Audio file not found: {audio2_file_id}")
        
        result = await transition_optimizer.recommend_transition(
            file1_path,
            file2_path,
            user_preference
        )
        
        return {
            "success": True,
            "recommendation": result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
