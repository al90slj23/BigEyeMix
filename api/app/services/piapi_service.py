"""
PiAPI Service - ACE-Step 音乐生成 API 集成
用于魔法填充音频过渡
"""

import httpx
import asyncio
import os
import uuid
from typing import Optional
from app.core.config import settings


class PiAPIService:
    def __init__(self):
        self.api_key = settings.PIAPI_KEY
        self.base_url = settings.PIAPI_BASE_URL
        self.headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json"
        }
    
    async def create_task(self, task_type: str, model: str, input_data: dict) -> dict:
        """创建 PiAPI 任务"""
        payload = {
            "model": model,
            "task_type": task_type,
            "input": input_data
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/api/v1/task",
                headers=self.headers,
                json=payload
            )
            response.raise_for_status()
            return response.json()
    
    async def get_task(self, task_id: str) -> dict:
        """获取任务状态"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}/api/v1/task/{task_id}",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()
    
    async def wait_for_task(self, task_id: str, max_wait: int = 120) -> dict:
        """等待任务完成"""
        for _ in range(max_wait):
            result = await self.get_task(task_id)
            status = result.get("data", {}).get("status")
            
            if status == "completed":
                return result
            elif status == "failed":
                error = result.get("data", {}).get("error", {})
                raise Exception(f"Task failed: {error.get('message', 'Unknown error')}")
            
            await asyncio.sleep(1)
        
        raise Exception("Task timeout")
    
    async def extend_audio(
        self,
        audio_url: str,
        right_extend_duration: int = 5,
        left_extend_duration: int = 0,
        style_prompt: str = "",
        lyrics: str = "[inst]"
    ) -> str:
        """
        扩展音频 - 用于生成过渡
        
        Args:
            audio_url: 源音频 URL
            right_extend_duration: 向右扩展秒数
            left_extend_duration: 向左扩展秒数
            style_prompt: 风格提示词
            lyrics: 歌词，[inst] 表示纯音乐
        
        Returns:
            生成的音频 URL
        """
        input_data = {
            "audio": audio_url,
            "right_extend_duration": right_extend_duration,
            "left_extend_duration": left_extend_duration,
            "style_prompt": style_prompt,
            "lyrics": lyrics,
            "negative_style_prompt": ""
        }
        
        # 创建任务
        result = await self.create_task(
            task_type="extend",
            model="Qubico/ace-step",
            input_data=input_data
        )
        
        task_id = result.get("data", {}).get("task_id")
        if not task_id:
            raise Exception("Failed to create task")
        
        # 等待完成
        final_result = await self.wait_for_task(task_id)
        
        # 获取输出音频 URL
        audio_url = final_result.get("data", {}).get("output", {}).get("audio_url")
        if not audio_url:
            raise Exception("No audio output")
        
        return audio_url
    
    async def download_audio(self, url: str, output_dir: str) -> str:
        """下载音频文件到本地"""
        output_id = f"{uuid.uuid4()}.mp3"
        output_path = os.path.join(output_dir, output_id)
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            with open(output_path, "wb") as f:
                f.write(response.content)
        
        return output_path


# 单例
piapi_service = PiAPIService()
