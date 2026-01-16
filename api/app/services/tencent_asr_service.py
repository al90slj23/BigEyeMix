"""
腾讯云语音识别服务
BigEyeMix 音频拼接平台
"""
import os
import json
import base64
import hmac
import hashlib
import time
from datetime import datetime
import httpx
import logging

logger = logging.getLogger(__name__)

class TencentASRService:
    """腾讯云实时语音识别服务"""
    
    def __init__(self):
        self.secret_id = os.getenv('TENCENT_SECRET_ID')
        self.secret_key = os.getenv('TENCENT_SECRET_KEY')
        self.app_id = os.getenv('TENCENT_APP_ID')
        self.region = 'ap-shanghai'
        self.service = 'asr'
        self.host = 'asr.tencentcloudapi.com'
        self.endpoint = f'https://{self.host}'
        self.version = '2019-06-14'
        
    def _sign(self, secret_key: str, string_to_sign: str) -> str:
        """生成签名"""
        return hmac.new(
            secret_key.encode('utf-8'),
            string_to_sign.encode('utf-8'),
            hashlib.sha256
        ).digest()
    
    def _get_authorization(self, params: dict, payload: str, timestamp: int) -> str:
        """生成腾讯云 API v3 签名"""
        # 1. 拼接规范请求串
        http_request_method = 'POST'
        canonical_uri = '/'
        canonical_querystring = ''
        canonical_headers = f'content-type:application/json\nhost:{self.host}\n'
        signed_headers = 'content-type;host'
        hashed_request_payload = hashlib.sha256(payload.encode('utf-8')).hexdigest()
        canonical_request = f'{http_request_method}\n{canonical_uri}\n{canonical_querystring}\n{canonical_headers}\n{signed_headers}\n{hashed_request_payload}'
        
        # 2. 拼接待签名字符串
        date = datetime.utcfromtimestamp(timestamp).strftime('%Y-%m-%d')
        credential_scope = f'{date}/{self.service}/tc3_request'
        hashed_canonical_request = hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()
        string_to_sign = f'TC3-HMAC-SHA256\n{timestamp}\n{credential_scope}\n{hashed_canonical_request}'
        
        # 3. 计算签名
        secret_date = self._sign(f'TC3{self.secret_key}', date)
        secret_service = self._sign(secret_date, self.service)
        secret_signing = self._sign(secret_service, 'tc3_request')
        signature = hmac.new(secret_signing, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()
        
        # 4. 拼接 Authorization
        authorization = f'TC3-HMAC-SHA256 Credential={self.secret_id}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}'
        
        return authorization
    
    async def recognize_audio(self, audio_data: bytes, audio_format: str = 'wav') -> dict:
        """
        识别音频文件
        
        Args:
            audio_data: 音频二进制数据
            audio_format: 音频格式 (wav, mp3, m4a, flac, opus, amr)
            
        Returns:
            识别结果字典
        """
        if not self.secret_id or not self.secret_key:
            logger.warning("未配置腾讯云密钥，使用模拟响应")
            return {
                'success': False,
                'error': '未配置腾讯云 ASR 服务',
                'text': ''
            }
        
        try:
            # 将音频转为 base64
            audio_base64 = base64.b64encode(audio_data).decode('utf-8')
            
            # 构建请求参数
            timestamp = int(time.time())
            params = {
                'EngineModelType': '16k_zh',  # 16k 中文通用模型
                'ChannelNum': 1,
                'ResTextFormat': 0,  # 0: 基础识别结果
                'SourceType': 1,  # 1: 音频数据
                'Data': audio_base64,
                'DataLen': len(audio_data)
            }
            
            # 添加音频格式参数
            format_map = {
                'wav': 1,
                'mp3': 3,
                'm4a': 4,
                'flac': 5,
                'opus': 6,
                'amr': 7
            }
            if audio_format.lower() in format_map:
                params['VoiceFormat'] = format_map[audio_format.lower()]
            
            payload = json.dumps(params)
            
            # 生成签名
            authorization = self._get_authorization(params, payload, timestamp)
            
            # 构建请求头
            headers = {
                'Authorization': authorization,
                'Content-Type': 'application/json',
                'Host': self.host,
                'X-TC-Action': 'SentenceRecognition',
                'X-TC-Version': self.version,
                'X-TC-Timestamp': str(timestamp),
                'X-TC-Region': self.region
            }
            
            # 发送请求
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.endpoint,
                    headers=headers,
                    content=payload
                )
                
                if response.status_code != 200:
                    logger.error(f"腾讯云 ASR 请求失败: {response.status_code} - {response.text}")
                    return {
                        'success': False,
                        'error': f'API 请求失败: {response.status_code}',
                        'text': ''
                    }
                
                result = response.json()
                
                # 检查响应
                if 'Response' in result:
                    response_data = result['Response']
                    
                    if 'Error' in response_data:
                        error = response_data['Error']
                        logger.error(f"腾讯云 ASR 错误: {error.get('Code')} - {error.get('Message')}")
                        return {
                            'success': False,
                            'error': error.get('Message', '识别失败'),
                            'text': ''
                        }
                    
                    # 获取识别结果
                    text = response_data.get('Result', '')
                    
                    return {
                        'success': True,
                        'text': text,
                        'request_id': response_data.get('RequestId', '')
                    }
                else:
                    logger.error(f"腾讯云 ASR 响应格式错误: {result}")
                    return {
                        'success': False,
                        'error': '响应格式错误',
                        'text': ''
                    }
                    
        except Exception as e:
            logger.error(f"腾讯云 ASR 调用异常: {str(e)}")
            return {
                'success': False,
                'error': str(e),
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
