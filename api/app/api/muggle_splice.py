"""
麻瓜拼接 API - 使用 DeepSeek AI 理解用户描述并生成拼接指令
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import httpx
import json
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class MuggleSpliceRequest(BaseModel):
    prompt: str
    system_prompt: str
    context: Dict[str, Any]
    user_description: str

class MuggleSpliceResponse(BaseModel):
    explanation: str
    instructions: Optional[List[Dict[str, Any]]] = None
    success: bool = True

@router.post("/ai/splice", response_model=MuggleSpliceResponse)
async def generate_muggle_splice(request: MuggleSpliceRequest):
    """
    使用 DeepSeek AI 生成麻瓜拼接方案
    """
    try:
        # 获取 DeepSeek API 密钥
        deepseek_key = os.getenv('APIKEY_MacOS_Code_DeepSeek')
        moonshot_key = os.getenv('APIKEY_MacOS_Code_MoonShot')
        
        if not deepseek_key and not moonshot_key:
            logger.warning("未配置 AI API 密钥，使用模拟响应")
            return generate_mock_response(request)
        
        # 选择 API
        if deepseek_key:
            api_url = "https://api.deepseek.com/chat/completions"
            api_key = deepseek_key
            model = "deepseek-chat"
        else:
            api_url = "https://api.moonshot.cn/v1/chat/completions"
            api_key = moonshot_key
            model = "moonshot-v1-8k"
        
        # 构建请求数据
        data = {
            "model": model,
            "messages": [
                {"role": "system", "content": request.system_prompt},
                {"role": "user", "content": request.prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 1500
        }
        
        # 调用 AI API
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                api_url,
                json=data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}"
                }
            )
            
            if response.status_code != 200:
                logger.error(f"AI API 调用失败: {response.status_code} - {response.text}")
                return generate_mock_response(request)
            
            result = response.json()
            ai_response = result["choices"][0]["message"]["content"].strip()
            
            return MuggleSpliceResponse(
                explanation=ai_response,
                instructions=parse_ai_instructions(ai_response, request.context),
                success=True
            )
            
    except Exception as e:
        logger.error(f"麻瓜拼接生成失败: {str(e)}")
        # 降级到模拟响应
        return generate_mock_response(request)

def generate_mock_response(request: MuggleSpliceRequest) -> MuggleSpliceResponse:
    """
    生成模拟响应（当 AI API 不可用时）
    """
    context = request.context
    tracks = context.get("tracks", [])
    user_desc = request.user_description
    
    if not tracks:
        return MuggleSpliceResponse(
            explanation="没有可用的音频文件，请先上传音频。",
            success=False
        )
    
    # 生成简单的拼接方案
    explanation = f'根据您的描述"{user_desc}"，我为您生成了以下拼接方案：\n\n'
    
    if len(tracks) >= 2:
        track1 = tracks[0]
        track2 = tracks[1]
        clip1 = track1["clips"][0] if track1["clips"] else None
        clip2 = track2["clips"][0] if track2["clips"] else None
        
        if clip1 and clip2:
            explanation += f'1. 使用 {track1["label"]}1 片段 ({format_time(clip1["start"])} - {format_time(clip1["end"])})\n'
            explanation += f'2. 添加 3秒 淡化过渡\n'
            explanation += f'3. 使用 {track2["label"]}1 片段 ({format_time(clip2["start"])} - {format_time(clip2["end"])})\n\n'
            
            total_duration = clip1["duration"] + clip2["duration"] + 3
            explanation += f'最终效果: 两段音频通过淡化过渡平滑连接，总时长约 {format_time(total_duration)}'
            
            instructions = [
                {"type": "clip", "trackId": track1["id"], "clipId": clip1["id"]},
                {"type": "transition", "transitionType": "crossfade", "duration": 3},
                {"type": "clip", "trackId": track2["id"], "clipId": clip2["id"]}
            ]
        else:
            explanation += "音频片段信息不完整，请检查上传的文件。"
            instructions = []
    else:
        track = tracks[0]
        clip = track["clips"][0] if track["clips"] else None
        
        if clip:
            mid_time = (clip["start"] + clip["end"]) / 2
            explanation += f'1. 使用 {track["label"]}1 片段的前半部分 ({format_time(clip["start"])} - {format_time(mid_time)})\n'
            explanation += f'2. 添加 2秒 静音填充\n'
            explanation += f'3. 使用 {track["label"]}1 片段的后半部分 ({format_time(mid_time)} - {format_time(clip["end"])})\n\n'
            explanation += f'最终效果: 单个音频文件中间插入静音间隔'
            
            instructions = [
                {"type": "clip", "trackId": track["id"], "clipId": clip["id"], "customStart": clip["start"], "customEnd": mid_time},
                {"type": "transition", "transitionType": "silence", "duration": 2},
                {"type": "clip", "trackId": track["id"], "clipId": clip["id"], "customStart": mid_time, "customEnd": clip["end"]}
            ]
        else:
            explanation += "音频片段信息不完整，请检查上传的文件。"
            instructions = []
    
    return MuggleSpliceResponse(
        explanation=explanation,
        instructions=instructions,
        success=True
    )

def parse_ai_instructions(ai_response: str, context: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    解析 AI 响应，提取可执行的指令
    这是一个简化版本，实际实现需要更复杂的 NLP 解析
    """
    instructions = []
    tracks = context.get("tracks", [])
    
    # 简单的关键词匹配解析
    lines = ai_response.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # 检测片段使用
        for track in tracks:
            for clip in track["clips"]:
                clip_name = f'{track["label"]}{clip["id"]}'
                if clip_name in line:
                    instructions.append({
                        "type": "clip",
                        "trackId": track["id"],
                        "clipId": clip["id"]
                    })
                    break
        
        # 检测过渡类型
        if "淡化过渡" in line or "crossfade" in line.lower():
            duration = extract_duration(line) or 3
            instructions.append({
                "type": "transition",
                "transitionType": "crossfade",
                "duration": duration
            })
        elif "节拍过渡" in line or "beatsync" in line.lower():
            duration = extract_duration(line) or 3
            instructions.append({
                "type": "transition",
                "transitionType": "beatsync",
                "duration": duration
            })
        elif "魔法填充" in line or "magic" in line.lower():
            duration = extract_duration(line) or 5
            instructions.append({
                "type": "transition",
                "transitionType": "magicfill",
                "duration": duration
            })
        elif "静音" in line or "silence" in line.lower():
            duration = extract_duration(line) or 2
            instructions.append({
                "type": "transition",
                "transitionType": "silence",
                "duration": duration
            })
    
    return instructions

def extract_duration(text: str) -> Optional[int]:
    """
    从文本中提取时长（秒）
    """
    import re
    
    # 匹配 "3秒", "5s", "2 秒" 等格式
    patterns = [
        r'(\d+)\s*秒',
        r'(\d+)\s*s',
        r'(\d+)\s*S'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return int(match.group(1))
    
    return None

def format_time(seconds: float) -> str:
    """
    格式化时间显示
    """
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    centisecs = int((seconds % 1) * 100)
    return f"{minutes:02d}:{secs:02d}.{centisecs:02d}"