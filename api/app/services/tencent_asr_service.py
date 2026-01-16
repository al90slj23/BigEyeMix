"""
腾讯云语音识别服务（使用官方 SDK）
BigEyeMix 音频拼接平台
"""
import os
import base64
import logging

logger = logging.getLogger(__name__)

class TencentASRService:
    """腾讯云一句话识别服务"""
    
    def __init__(self):
        self.secret_id = os.getenv('TENCENT_SECRET_ID')
        self.secret_key = os.getenv('TENCENT_SECRET_KEY')
        self.app_id = os.getenv('TENCENT_APP_ID')
        
        # 调试日志
        logger.info(f"腾讯云 ASR 初始化: SecretId={'已配置' if self.secret_id else '未配置'}, SecretKey={'已配置' if self.secret_key else '未配置'}, AppId={self.app_id or '未配置'}")
        
        # 延迟导入 SDK（避免未安装时启动失败）
        self.client = None
        if self.secret_id and self.secret_key:
            try:
                from tencentcloud.common import credential
                from tencentcloud.common.profile.client_profile import ClientProfile
                from tencentcloud.common.profile.http_profile import HttpProfile
                from tencentcloud.asr.v20190614 import asr_client, models
                
                # 实例化认证对象
                cred = credential.Credential(self.secret_id, self.secret_key)
                
                # 实例化 HTTP 配置
                httpProfile = HttpProfile()
                httpProfile.endpoint = "asr.tencentcloudapi.com"
                
                # 实例化客户端配置
                clientProfile = ClientProfile()
                clientProfile.httpProfile = httpProfile
                
                # 实例化客户端
                self.client = asr_client.AsrClient(cred, "ap-shanghai", clientProfile)
                self.models = models
                
                logger.info("腾讯云 ASR SDK 初始化成功")
            except ImportError as e:
                logger.error(f"腾讯云 SDK 未安装: {e}")
                logger.error("请运行: pip install tencentcloud-sdk-python-asr")
            except Exception as e:
                logger.error(f"腾讯云 ASR SDK 初始化失败: {e}")
    
    async def recognize_audio(self, audio_data: bytes, audio_format: str = 'wav') -> dict:
        """
        识别音频文件
        
        Args:
            audio_data: 音频二进制数据
            audio_format: 音频格式 (wav, mp3, m4a, flac, opus, amr, webm, ogg)
            
        Returns:
            识别结果字典
        """
        if not self.client:
            logger.warning("腾讯云 ASR 客户端未初始化")
            return {
                'success': False,
                'error': '未配置腾讯云 ASR 服务',
                'text': ''
            }
        
        try:
            # 将音频转为 base64
            audio_base64 = base64.b64encode(audio_data).decode('utf-8')
            
            # 音频格式映射
            format_map = {
                'wav': 1,
                'mp3': 3,
                'm4a': 4,
                'flac': 5,
                'opus': 6,
                'amr': 7,
                'webm': 1,  # webm 当作 wav 处理
                'ogg': 1    # ogg 当作 wav 处理
            }
            voice_format = format_map.get(audio_format.lower(), 1)
            
            # 构建请求
            req = self.models.SentenceRecognitionRequest()
            req.EngineModelType = "16k_zh"  # 16k 中文通用模型
            req.ChannelNum = 1
            req.ResTextFormat = 0  # 0: 基础识别结果
            req.SourceType = 1  # 1: 音频数据
            req.Data = audio_base64
            req.DataLen = len(audio_data)
            req.VoiceFormat = voice_format
            
            logger.info(f"发送识别请求: 格式={audio_format}, 大小={len(audio_data)} bytes")
            
            # 发送请求
            resp = self.client.SentenceRecognition(req)
            
            # 获取识别结果
            text = resp.Result or ""
            
            logger.info(f"识别成功: {text}")
            
            return {
                'success': True,
                'text': text,
                'request_id': resp.RequestId
            }
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"腾讯云 ASR 调用异常: {error_msg}")
            return {
                'success': False,
                'error': error_msg,
                'text': ''
            }
    
    async def recognize_audio_file(self, file_path: str) -> dict:
        """
        识别音频文件
        
        Args:
            file_path: 音频文件路径
            
        Returns:
            识别结果字典
        """
        try:
            # 读取音频文件
            with open(file_path, 'rb') as f:
                audio_data = f.read()
            
            # 获取文件格式
            audio_format = file_path.split('.')[-1].lower()
            
            return await self.recognize_audio(audio_data, audio_format)
            
        except Exception as e:
            logger.error(f"读取音频文件失败: {str(e)}")
            return {
                'success': False,
                'error': f'读取文件失败: {str(e)}',
                'text': ''
            }


# 全局实例
tencent_asr_service = TencentASRService()
