"""
语音识别 API
BigEyeMix 音频拼接平台
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.tencent_asr_service import tencent_asr_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/asr/recognize")
async def recognize_speech(audio: UploadFile = File(...)):
    """
    语音识别接口
    
    接收音频文件，返回识别的文字
    支持格式: wav, mp3, m4a, flac, opus, amr
    """
    try:
        # 检查文件格式
        allowed_formats = ['wav', 'mp3', 'm4a', 'flac', 'opus', 'amr', 'webm', 'ogg']
        file_ext = audio.filename.split('.')[-1].lower() if '.' in audio.filename else ''
        
        if file_ext not in allowed_formats:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的音频格式: {file_ext}，支持的格式: {', '.join(allowed_formats)}"
            )
        
        # 读取音频数据
        audio_data = await audio.read()
        
        if len(audio_data) == 0:
            raise HTTPException(status_code=400, detail="音频文件为空")
        
        # 检查文件大小（腾讯云限制 5MB）
        max_size = 5 * 1024 * 1024  # 5MB
        if len(audio_data) > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"音频文件过大，最大支持 5MB，当前: {len(audio_data) / 1024 / 1024:.2f}MB"
            )
        
        logger.info(f"收到语音识别请求: {audio.filename}, 大小: {len(audio_data)} bytes")
        
        # 调用腾讯云 ASR
        result = await tencent_asr_service.recognize_audio(audio_data, file_ext)
        
        if result['success']:
            logger.info(f"识别成功: {result['text']}")
            return {
                'success': True,
                'text': result['text'],
                'message': '识别成功'
            }
        else:
            logger.error(f"识别失败: {result.get('error', '未知错误')}")
            return {
                'success': False,
                'text': '',
                'error': result.get('error', '识别失败'),
                'message': '识别失败'
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"语音识别异常: {str(e)}")
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")
