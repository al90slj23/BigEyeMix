"""
麻瓜拼接 API - 使用 DeepSeek AI 理解用户描述并生成拼接指令
采用结构化输出和多层验证机制确保稳定性
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, validator
from typing import Dict, List, Any, Optional, Union, Literal
import httpx
import json
import os
import logging
import re
from enum import Enum

logger = logging.getLogger(__name__)

router = APIRouter()

# 定义处理类型枚举
class ProcessingType(str, Enum):
    CROSSFADE = "crossfade"  # 淡化过渡
    BEATSYNC = "beatsync"    # 节拍过渡
    MAGICFILL = "magicfill"  # 魔法填充
    SILENCE = "silence"      # 静音填充

# 定义指令类型枚举
class InstructionType(str, Enum):
    CLIP = "clip"
    TRANSITION = "transition"

# 片段指令模型
class ClipInstruction(BaseModel):
    type: Literal["clip"] = "clip"
    trackId: Union[str, int] = Field(..., description="轨道ID（支持数字或字符串）")
    clipId: Union[str, int] = Field(..., description="片段ID（支持数字或字符串）")
    customStart: Optional[float] = Field(None, description="自定义开始时间（秒）")
    customEnd: Optional[float] = Field(None, description="自定义结束时间（秒）")
    
    @validator('customStart', 'customEnd')
    def validate_time(cls, v):
        if v is not None and v < 0:
            raise ValueError("时间不能为负数")
        return v

# 过渡指令模型
class TransitionInstruction(BaseModel):
    type: Literal["transition"] = "transition"
    transitionType: ProcessingType = Field(..., description="处理类型")
    duration: float = Field(..., gt=0, le=30, description="处理时长（秒），必须大于0且小于等于30")

# 结构化AI响应模型
class StructuredAIResponse(BaseModel):
    explanation: str = Field(..., description="拼接方案的详细说明")
    instructions: List[Union[ClipInstruction, TransitionInstruction]] = Field(
        ..., 
        description="可执行的拼接指令序列",
        min_items=1
    )
    estimated_duration: float = Field(..., gt=0, description="预估总时长（秒）")
    
    @validator('instructions')
    def validate_instructions_sequence(cls, v):
        if not v:
            raise ValueError("指令序列不能为空")
        
        # 验证指令序列的合理性
        clip_count = sum(1 for inst in v if inst.type == "clip")
        transition_count = sum(1 for inst in v if inst.type == "transition")
        
        if clip_count == 0:
            raise ValueError("至少需要一个片段指令")
        
        # 检查指令顺序：不能连续两个过渡，不能以过渡开始
        if v[0].type == "transition":
            raise ValueError("不能以过渡指令开始")
        
        for i in range(len(v) - 1):
            if v[i].type == "transition" and v[i + 1].type == "transition":
                raise ValueError("不能有连续的过渡指令")
        
        return v

# API请求模型
class MuggleSpliceRequest(BaseModel):
    prompt: str
    system_prompt: str
    context: Dict[str, Any]
    user_description: str

# API响应模型
class MuggleSpliceResponse(BaseModel):
    explanation: str
    instructions: Optional[List[Dict[str, Any]]] = None
    success: bool = True
    validation_errors: Optional[List[str]] = None
    retry_count: Optional[int] = None

@router.post("/ai/splice", response_model=MuggleSpliceResponse)
async def generate_muggle_splice(request: MuggleSpliceRequest):
    """
    使用 DeepSeek AI 生成麻瓜拼接方案
    采用结构化输出和多层验证机制
    """
    max_retries = 3
    validation_errors = []
    
    for retry_count in range(max_retries):
        try:
            # 获取 DeepSeek API 密钥
            from app.core.config import settings
            deepseek_key = settings.APIKEY_MacOS_Code_DeepSeek
            moonshot_key = settings.APIKEY_MacOS_Code_MoonShot
            
            if not deepseek_key and not moonshot_key:
                raise HTTPException(
                    status_code=500,
                    detail="未配置 AI API 密钥。请在 .env 文件中配置 APIKEY_MacOS_Code_DeepSeek 或 APIKEY_MacOS_Code_MoonShot"
                )
            
            # 选择 API
            if deepseek_key:
                api_url = "https://api.deepseek.com/chat/completions"
                api_key = deepseek_key
                model = "deepseek-reasoner"  # 使用推理模型，更强的逻辑理解能力
            else:
                api_url = "https://api.moonshot.cn/v1/chat/completions"
                api_key = moonshot_key
                model = "moonshot-v1-8k"
            
            # 构建结构化提示词
            structured_prompt = build_structured_prompt(request, retry_count, validation_errors)
            
            # 构建请求数据
            data = {
                "model": model,
                "messages": [
                    {"role": "system", "content": request.system_prompt},
                    {"role": "user", "content": structured_prompt}
                ],
                "temperature": 0.0,  # 代码生成/数学解题场景，需要准确结果
                "max_tokens": 2000,
                "response_format": {
                    "type": "json_object"  # 强制 JSON 输出
                }
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
                    if retry_count == max_retries - 1:
                        raise HTTPException(
                            status_code=500,
                            detail=f"AI API 调用失败: {response.status_code} - {response.text}"
                        )
                    continue
                
                result = response.json()
                ai_response = result["choices"][0]["message"]["content"].strip()
                
                # 解析和验证AI响应
                parsed_result = parse_and_validate_ai_response(ai_response, request.context)
                
                if parsed_result["success"]:
                    return MuggleSpliceResponse(
                        explanation=parsed_result["explanation"],
                        instructions=convert_to_legacy_format(parsed_result["instructions"]),
                        success=True,
                        retry_count=retry_count
                    )
                else:
                    validation_errors.extend(parsed_result["errors"])
                    if retry_count == max_retries - 1:
                        # 最后一次重试失败，抛出错误
                        raise HTTPException(
                            status_code=500,
                            detail=f"AI 响应验证失败: {'; '.join(validation_errors)}"
                        )
                    
        except Exception as e:
            logger.error(f"麻瓜拼接生成失败 (重试 {retry_count + 1}): {str(e)}")
            validation_errors.append(f"API调用异常: {str(e)}")
            if retry_count == max_retries - 1:
                raise HTTPException(
                    status_code=500,
                    detail=f"麻瓜拼接生成失败: {str(e)}"
                )

def build_structured_prompt(request: MuggleSpliceRequest, retry_count: int, validation_errors: List[str]) -> str:
    """
    构建结构化提示词，强制JSON输出格式
    """
    context = request.context
    tracks = context.get("tracks", [])
    user_desc = request.user_description
    
    # 构建轨道信息
    tracks_info = ""
    for track in tracks:
        # 轨道基本信息
        track_duration = track.get('duration', 0)
        tracks_info += f"轨道 {track['label']} - {track.get('name', '未知文件')}\n"
        tracks_info += f"  总时长: {format_time(track_duration)} ({track_duration:.2f}秒)\n"
        
        # 片段信息
        clips_info = []
        for clip in track.get("clips", []):
            clip_duration = clip.get('duration', clip['end'] - clip['start'])
            clips_info.append(
                f"  - 片段{track['label']}{clip['id']}: "
                f"{format_time(clip['start'])} - {format_time(clip['end'])} "
                f"(时长 {format_time(clip_duration)} = {clip_duration:.2f}秒)"
            )
        
        if clips_info:
            tracks_info += "\n".join(clips_info) + "\n"
        tracks_info += "\n"
    
    # 重试时的错误反馈
    retry_feedback = ""
    if retry_count > 0 and validation_errors:
        retry_feedback = f"""
上次生成失败，错误信息：
{chr(10).join(f"- {error}" for error in validation_errors[-3:])}

请修正这些问题并重新生成。
"""
    
    # 构建结构化提示词
    prompt = f"""你是专业的音频拼接专家。请根据用户描述生成详细的拼接方案。

⚠️ 关键理解规则（必读）：

1. **"分成N份"的正确理解：**
   - ❌ 错误：使用完整的音频（trackId: "A", clipId: "1"）
   - ✅ 正确：生成N个独立的clip指令，每个都有customStart和customEnd
   - 例如：A1总时长180s，"分成3份" → 生成3个clip：
     * clip1: trackId="A", clipId="1", customStart=0, customEnd=60
     * clip2: trackId="A", clipId="1", customStart=60, customEnd=120
     * clip3: trackId="A", clipId="1", customStart=120, customEnd=180

2. **"交替"、"摆开"、"穿插"的正确理解：**
   - ❌ 错误：A完整 + B完整（只有2个clip）
   - ✅ 正确：A1 + B1 + A2 + B2 + A3（5个clip交替）
   - 必须生成交替的指令序列，不是简单拼接

3. **同时有"分成"和"交替"时：**
   - 先分割每个音频
   - 再按顺序交替排列
   - 例如：A分3份，B分2份，交替 → A1 + B1 + A2 + B2 + A3

{retry_feedback}

可用音频资源：
{tracks_info}

用户描述："{user_desc}"

处理类型说明：
- crossfade (淡化过渡): 两段音频平滑过渡，会减少总时长
- beatsync (节拍过渡): 按节拍对齐过渡，会减少总时长  
- magicfill (魔法填充): AI生成过渡音频，会增加总时长
- silence (静音填充): 插入静音间隔，会增加总时长

详细规则：
1. 必须返回有效的JSON格式
2. 指令序列必须以clip开始，不能以transition开始
3. 不能有连续的transition指令
4. 时长必须为正数且合理（≤30秒）
5. 必须包含至少一个clip指令

6. **⚠️ 时长计算规则（极其重要）：**
   - estimated_duration 必须精确计算，不能估算
   - 计算公式：所有clip的实际时长之和 + 所有transition的时长 - overlap时长
   - crossfade和beatsync会减少总时长（overlap = transition.duration）
   - magicfill和silence会增加总时长（不overlap）
   - 例如：A1(60s) + crossfade(3s) + B1(50s) = 60 + 50 - 3 = 107s
   - 例如：A1(60s) + magicfill(5s) + B1(50s) = 60 + 5 + 50 = 115s
   - 使用customStart和customEnd时，时长 = customEnd - customStart

7. **当用户说"分成N份"时，必须将音频分割成N个片段：**
   - 计算每份的时长：总时长 / N
   - 为每份创建独立的clip指令，使用customStart和customEnd
   - 例如：A1总时长180s，分成3份 → A1a(0~60s), A1b(60~120s), A1c(120~180s)
   - 注意：这是3个独立的clip指令，不是1个完整的clip

8. **当用户说"去掉某段"或"不要某段"时，需要将该音频拆分成两个clip指令：**
   - 第一个clip：从开始到去掉部分的开始时间（使用customStart和customEnd）
   - 第二个clip：从去掉部分的结束时间到音频结尾（使用customStart和customEnd）
   - 例如：去掉1:56~2:34，则生成两个clip：0~1:56 和 2:34~结尾

9. **当用户说"摆开"、"交替"、"穿插"、"间隔"时，必须生成交替的指令序列：**
   - 不是简单的 A + B 拼接
   - 而是 A1 + B1 + A2 + B2 + A3 的交替模式
   - 在每个clip之间添加transition指令

示例1 - 分成N份然后交替摆开（最重要）：
用户："把第一段分成3份，把第二段分成2份，然后把他们交替摆开"
正确理解：
- 将A1分成3份：A1a(0~64s), A1b(64~128s), A1c(128~192s)
- 将B1分成2份：B1a(0~58s), B1b(58~116s)
- 交替摆开：A1a + B1a + A1b + B1b + A1c
- ⚠️ 注意：这是5个clip指令，不是2个！

正确输出：
{{
  "instructions": [
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 64}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "B", "clipId": "1", "customStart": 0, "customEnd": 58}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 64, "customEnd": 128}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "B", "clipId": "1", "customStart": 58, "customEnd": 116.6}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 128, "customEnd": 192.28}}
  ],
  "estimated_duration": 300.88,
  "explanation": "根据您的描述，我为您生成了以下拼接方案：\n\n片段定义：\n- A1a片段：《知我》00:00.00 - 01:04.00（第1份，共3份）\n- B1a片段：《春颂》00:00.00 - 00:58.00（第1份，共2份）\n- A1b片段：《知我》01:04.00 - 02:08.00（第2份，共3份）\n- B1b片段：《春颂》00:58.00 - 01:56.60（第2份，共2份）\n- A1c片段：《知我》02:08.00 - 03:12.28（第3份，共3份）\n\n拼接顺序：\nA1a + (3.0秒 淡化过渡) + B1a + (3.0秒 淡化过渡) + A1b + (3.0秒 淡化过渡) + B1b + (3.0秒 淡化过渡) + A1c\n\n最终效果：将两段音频分别分割后交替拼接，A和B交替出现，总时长约 05:00.88"
}}
}}

示例2 - 去掉中间某段：
用户："《知我》1分56～2分34这一段不要，剩下的部分《知我》＋《春颂》（整段）"
正确理解：
- A1片段：《知我》0~1:56
- A2片段：《知我》2:34~结尾（AI需要查找A轨道的实际结束时间）
- B1片段：《春颂》0~结尾（完整）
- 拼接顺序：A1 + (3s 淡化过渡) + A2 + (3s 淡化过渡) + B1

正确输出：
{
  "instructions": [
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 116}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 154, "customEnd": 192.28}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "B", "clipId": "1"}}
  ],
  "estimated_duration": 298.88,
  "explanation": "根据您的描述，我为您生成了以下拼接方案：\n\n片段定义：\n- A1片段：《知我》00:00.00 - 01:56.00\n- A2片段：《知我》02:34.00 - 03:12.28（结尾）\n- B1片段：《春颂》00:00.00 - 01:56.60（完整）\n\n拼接顺序：\nA1 + (3.0秒 淡化过渡) + A2 + (3.0秒 淡化过渡) + B1\n\n最终效果：去掉《知我》中间38秒，保留前后部分，然后与《春颂》完整拼接，总时长约 04:58.88"
}

示例2 - 去掉中间某段：
用户："《知我》1分56～2分34这一段不要，剩下的部分《知我》＋《春颂》（整段）"
正确理解：
- A1片段：《知我》0~1:56
- A2片段：《知我》2:34~结尾（AI需要查找A轨道的实际结束时间）
- B1片段：《春颂》0~结尾（完整）
- 拼接顺序：A1 + (3s 淡化过渡) + A2 + (3s 淡化过渡) + B1

正确输出：
{
  "instructions": [
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 116}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 154, "customEnd": 192.28}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "B", "clipId": "1"}}
  ],
  "estimated_duration": 298.88,
  "explanation": "根据您的描述，我为您生成了以下拼接方案：\n\n片段定义：\n- A1片段：《知我》00:00.00 - 01:56.00\n- A2片段：《知我》02:34.00 - 03:12.28（结尾）\n- B1片段：《春颂》00:00.00 - 01:56.60（完整）\n\n拼接顺序：\nA1 + (3.0秒 淡化过渡) + A2 + (3.0秒 淡化过渡) + B1\n\n最终效果：去掉《知我》中间38秒，保留前后部分，然后与《春颂》完整拼接，总时长约 04:58.88"
}

示例3 - 完整拼接：
用户："《知我》全部 + 《春颂》全部"
正确理解：
- A1片段：《知我》0~结尾（完整）
- B1片段：《春颂》0~结尾（完整）
- 拼接顺序：A1 + (3s 淡化过渡) + B1

正确输出：
{
  "instructions": [
    {{"type": "clip", "trackId": "A", "clipId": "1"}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "B", "clipId": "1"}}
  ],
  "estimated_duration": 305.88,
  "explanation": "根据您的描述，我为您生成了以下拼接方案：\n\n片段定义：\n- A1片段：《知我》00:00.00 - 03:12.28（完整）\n- B1片段：《春颂》00:00.00 - 01:56.60（完整）\n\n拼接顺序：\nA1 + (3.0秒 淡化过渡) + B1\n\n最终效果：两段音频完整拼接，总时长约 05:05.88"
}

示例3 - 完整拼接：
用户："《知我》全部 + 《春颂》全部"
正确理解：
- A1片段：《知我》0~结尾（完整）
- B1片段：《春颂》0~结尾（完整）
- 拼接顺序：A1 + (3s 淡化过渡) + B1

正确输出：
{
  "instructions": [
    {{"type": "clip", "trackId": "A", "clipId": "1"}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "B", "clipId": "1"}}
  ],
  "estimated_duration": 305.88,
  "explanation": "根据您的描述，我为您生成了以下拼接方案：\n\n片段定义：\n- A1片段：《知我》00:00.00 - 03:12.28（完整）\n- B1片段：《春颂》00:00.00 - 01:56.60（完整）\n\n拼接顺序：\nA1 + (3.0秒 淡化过渡) + B1\n\n最终效果：两段音频完整拼接，总时长约 05:05.88"
}

示例4 - 分段插入（重要）：
用户："把第一段音频分成1分钟、1分钟、1分钟这样的间隔，然后在每个中间都加入第二段音频"
正确理解：
- 将A1分成多个1分钟片段：A1a(0~60s), A1b(60~120s), A1c(120~180s)
- 在每个A片段之间插入完整的B1
- 拼接顺序：A1a + B1 + A1b + B1 + A1c

正确输出：
{
  "instructions": [
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 60}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "B", "clipId": "1"}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 60, "customEnd": 120}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "B", "clipId": "1"}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 120, "customEnd": 180}}
  ],
  "estimated_duration": 405.2,
  "explanation": "根据您的描述，我为您生成了以下拼接方案：\n\n片段定义：\n- A1a片段：《知我》00:00.00 - 01:00.00\n- A1b片段：《知我》01:00.00 - 02:00.00\n- A1c片段：《知我》02:00.00 - 03:00.00\n- B1片段：《春颂》00:00.00 - 01:56.60（完整）\n\n拼接顺序：\nA1a + (3.0秒 淡化过渡) + B1 + (3.0秒 淡化过渡) + A1b + (3.0秒 淡化过渡) + B1 + (3.0秒 淡化过渡) + A1c\n\n最终效果：将《知我》分成3个1分钟片段，在每个片段之间插入《春颂》完整音频，总时长约 06:45.20"
}

示例4 - 分段插入（静音间隔）：
用户："把第一段音频每隔30秒加入2秒静音"
正确理解：
- 将A1分成多个30秒片段
- 在每个片段之间插入2秒静音
- 拼接顺序：A1a(0~30s) + 2s静音 + A1b(30~60s) + 2s静音 + A1c(60~90s) + ...

正确输出：
{
  "instructions": [
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 30}},
    {{"type": "transition", "transitionType": "silence", "duration": 2}},
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 30, "customEnd": 60}},
    {{"type": "transition", "transitionType": "silence", "duration": 2}},
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 60, "customEnd": 90}},
    {{"type": "transition", "transitionType": "silence", "duration": 2}},
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 90, "customEnd": 120}}
  ],
  "estimated_duration": 126,
  "explanation": "根据您的描述，我为您生成了以下拼接方案：\n\n片段定义：\n- A1a片段：《知我》00:00.00 - 00:30.00\n- A1b片段：《知我》00:30.00 - 01:00.00\n- A1c片段：《知我》01:00.00 - 01:30.00\n- A1d片段：《知我》01:30.00 - 02:00.00\n\n拼接顺序：\nA1a + (2.0秒 静音填充) + A1b + (2.0秒 静音填充) + A1c + (2.0秒 静音填充) + A1d\n\n最终效果：将《知我》每隔30秒插入2秒静音，总时长约 02:06.00"
}

示例5 - 分成N份然后交替摆开（关键）：
用户："把第一段分成3份，把第二段分成2份，然后把他们交替摆开"
正确理解：
- 将A1分成3份：A1a(0~64s), A1b(64~128s), A1c(128~192s)
- 将B1分成2份：B1a(0~58s), B1b(58~116s)
- 交替摆开：A1a + B1a + A1b + B1b + A1c

正确输出：
{
  "instructions": [
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 64}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "B", "clipId": "1", "customStart": 0, "customEnd": 58}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 64, "customEnd": 128}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "B", "clipId": "1", "customStart": 58, "customEnd": 116.6}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 128, "customEnd": 192.28}}
  ],
  "estimated_duration": 300.88,
  "explanation": "根据您的描述，我为您生成了以下拼接方案：\n\n片段定义：\n- A1a片段：《知我》00:00.00 - 01:04.00（第1份）\n- B1a片段：《春颂》00:00.00 - 00:58.00（第1份）\n- A1b片段：《知我》01:04.00 - 02:08.00（第2份）\n- B1b片段：《春颂》00:58.00 - 01:56.60（第2份）\n- A1c片段：《知我》02:08.00 - 03:12.28（第3份）\n\n拼接顺序：\nA1a + (3.0秒 淡化过渡) + B1a + (3.0秒 淡化过渡) + A1b + (3.0秒 淡化过渡) + B1b + (3.0秒 淡化过渡) + A1c\n\n最终效果：将两段音频分别分割后交替拼接，总时长约 05:00.88"
}

输出格式要求：
1. **你的推理过程会自动显示给用户**，所以请在推理时详细思考：
   - 用户想要什么效果
   - 需要分成几个片段
   - 如何交替排列
   - 时长如何计算
   
2. **最终输出必须是纯 JSON 格式**，包含两个字段（按顺序）：
   - `instructions`: 【第一部分】给程序使用的标准 JSON 指令数组（优先输出，让程序快速处理）
   - `explanation`: 【第二部分】给人类看的详细说明（包含片段定义、拼接顺序、最终效果）
   - `estimated_duration`: 精确计算的总时长（数字）

3. **explanation 格式要求**：
   - 第一部分：片段定义（列出所有使用的片段，格式：轨道标签+片段ID+时间范围）
   - 第二部分：拼接顺序（用 + 和括号清晰展示拼接逻辑）
   - 第三部分：最终效果（说明总时长和效果）
   - 时间格式统一使用 mm:ss.cc（如 01:56.00）

4. **instructions 格式要求**：
   - 每个 clip 必须包含 type, trackId, clipId
   - 如果需要自定义时间范围，添加 customStart 和 customEnd（数字类型，单位：秒）
   - 每个 transition 必须包含 type, transitionType, duration（数字类型，单位：秒）

请严格按照以下 JSON 格式输出（不要添加 markdown 代码块标记）：

{{
  "instructions": [
    {{"type": "clip", "trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 64}},
    {{"type": "transition", "transitionType": "crossfade", "duration": 3}},
    ...
  ],
  "estimated_duration": 数值,
  "explanation": "详细的拼接方案说明..."
}}"""

    return prompt

def parse_and_validate_ai_response(ai_response: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """
    解析和验证AI响应，使用多层验证机制
    """
    errors = []
    
    try:
        # 第一层：JSON格式验证
        json_content = extract_json_from_response(ai_response)
        if not json_content:
            return {"success": False, "errors": ["无法从响应中提取有效的JSON格式"]}
        
        parsed_json = json.loads(json_content)
        
        # 第二层：结构验证
        try:
            validated_response = StructuredAIResponse(**parsed_json)
        except Exception as e:
            return {"success": False, "errors": [f"JSON结构验证失败: {str(e)}"]}
        
        # 第三层：语义验证
        semantic_errors = validate_semantic_logic(validated_response, context)
        if semantic_errors:
            return {"success": False, "errors": semantic_errors}
        
        # 验证通过
        return {
            "success": True,
            "explanation": validated_response.explanation,
            "instructions": validated_response.instructions,
            "estimated_duration": validated_response.estimated_duration
        }
        
    except json.JSONDecodeError as e:
        return {"success": False, "errors": [f"JSON解析失败: {str(e)}"]}
    except Exception as e:
        return {"success": False, "errors": [f"响应处理异常: {str(e)}"]}

def extract_json_from_response(response: str) -> Optional[str]:
    """
    从AI响应中提取JSON内容，支持多种格式
    """
    # 移除markdown代码块标记
    response = re.sub(r'```json\s*', '', response)
    response = re.sub(r'```\s*$', '', response)
    
    # 尝试直接解析整个响应
    response = response.strip()
    if response.startswith('{') and response.endswith('}'):
        return response
    
    # 尝试提取JSON对象
    json_pattern = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
    matches = re.findall(json_pattern, response, re.DOTALL)
    
    for match in matches:
        try:
            json.loads(match)  # 验证是否为有效JSON
            return match
        except:
            continue
    
    return None

def validate_semantic_logic(response: StructuredAIResponse, context: Dict[str, Any]) -> List[str]:
    """
    验证响应的语义逻辑合理性
    """
    errors = []
    tracks = context.get("tracks", [])
    # 同时支持 ID 和 label 作为轨道标识
    track_ids = {track["id"] for track in tracks}
    track_labels = {track["label"] for track in tracks}
    valid_track_identifiers = track_ids | track_labels
    
    # 验证轨道和片段引用的有效性
    for instruction in response.instructions:
        if instruction.type == "clip":
            # 支持通过 ID（数字或字符串）或 label 查找轨道
            instruction_track_id = instruction.trackId
            instruction_track_id_str = str(instruction.trackId)
            try:
                instruction_track_id_int = int(instruction.trackId)
            except (ValueError, TypeError):
                instruction_track_id_int = None
            
            # 检查轨道是否存在
            track_found = (
                instruction_track_id in valid_track_identifiers or
                instruction_track_id_str in track_labels or
                (instruction_track_id_int is not None and instruction_track_id_int in track_ids)
            )
            
            if not track_found:
                errors.append(f"引用了不存在的轨道ID: {instruction.trackId}")
                continue
            
            # 查找对应轨道（支持通过 ID 或 label 查找，支持数字和字符串）
            track = None
            for t in tracks:
                if (t["id"] == instruction.trackId or 
                    t["label"] == instruction.trackId or
                    str(t["id"]) == str(instruction.trackId) or
                    t["label"] == str(instruction.trackId)):
                    track = t
                    break
            
            if track:
                # 同时支持数字和字符串类型的 clipId
                clip_ids = {clip["id"] for clip in track.get("clips", [])}
                clip_ids_str = {str(clip["id"]) for clip in track.get("clips", [])}
                
                # 将 instruction.clipId 转换为字符串和数字进行比较
                instruction_clip_id = instruction.clipId
                instruction_clip_id_str = str(instruction.clipId)
                try:
                    instruction_clip_id_int = int(instruction.clipId)
                except (ValueError, TypeError):
                    instruction_clip_id_int = None
                
                # 检查 clipId 是否存在（支持数字或字符串）
                clip_found = (
                    instruction_clip_id in clip_ids or 
                    instruction_clip_id_str in clip_ids_str or
                    (instruction_clip_id_int is not None and instruction_clip_id_int in clip_ids)
                )
                
                if not clip_found:
                    errors.append(f"轨道 {instruction.trackId} 中不存在片段ID: {instruction.clipId}")
    
    # 验证时长估算的合理性
    total_clip_duration = 0
    total_transition_duration = 0
    overlap_duration = 0
    
    for instruction in response.instructions:
        if instruction.type == "clip":
            # 查找片段实际时长（支持通过 ID 或 label 查找，支持数字和字符串）
            track = None
            for t in tracks:
                if (t["id"] == instruction.trackId or 
                    t["label"] == instruction.trackId or
                    str(t["id"]) == str(instruction.trackId) or
                    t["label"] == str(instruction.trackId)):
                    track = t
                    break
            
            if track:
                # 查找 clip，支持数字和字符串类型的 clipId
                clip = None
                for c in track.get("clips", []):
                    if (c["id"] == instruction.clipId or 
                        str(c["id"]) == str(instruction.clipId)):
                        clip = c
                        break
                
                if clip:
                    if instruction.customStart is not None and instruction.customEnd is not None:
                        total_clip_duration += instruction.customEnd - instruction.customStart
                    else:
                        total_clip_duration += clip["duration"]
        elif instruction.type == "transition":
            total_transition_duration += instruction.duration
            if instruction.transitionType in ["crossfade", "beatsync"]:
                overlap_duration += instruction.duration
    
    # 计算预期时长
    expected_duration = total_clip_duration + total_transition_duration - overlap_duration
    duration_diff = abs(response.estimated_duration - expected_duration)
    
    # 动态计算允许误差：
    # - 对于短音频（<120s）：允许50%的相对误差或15秒（取较大值）
    # - 对于长音频（>=120s）：允许20%的相对误差或15秒（取较大值）
    if expected_duration < 120:
        allowed_error = max(15, expected_duration * 0.5)
    else:
        allowed_error = max(15, expected_duration * 0.2)
    
    if duration_diff > allowed_error:
        errors.append(f"预估时长 {response.estimated_duration:.1f}s 与计算时长 {expected_duration:.1f}s 差异过大（差异 {duration_diff:.1f}s，允许 {allowed_error:.1f}s）")
    
    return errors

def convert_to_legacy_format(instructions: List[Union[ClipInstruction, TransitionInstruction]]) -> List[Dict[str, Any]]:
    """
    将结构化指令转换为前端兼容的格式
    """
    legacy_instructions = []
    
    for instruction in instructions:
        if isinstance(instruction, ClipInstruction):
            legacy_inst = {
                "type": "clip",
                "trackId": instruction.trackId,
                "clipId": instruction.clipId
            }
            if instruction.customStart is not None:
                legacy_inst["customStart"] = instruction.customStart
            if instruction.customEnd is not None:
                legacy_inst["customEnd"] = instruction.customEnd
        else:  # TransitionInstruction
            legacy_inst = {
                "type": "transition",
                "transitionType": instruction.transitionType,
                "duration": instruction.duration
            }
        
        legacy_instructions.append(legacy_inst)
    
    return legacy_instructions

def parse_ai_instructions(ai_response: str, context: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    解析 AI 响应，提取可执行的指令（保留用于向后兼容）
    """
    # 尝试使用新的结构化解析
    parsed_result = parse_and_validate_ai_response(ai_response, context)
    if parsed_result["success"]:
        return convert_to_legacy_format(parsed_result["instructions"])
    
    # 降级到原有的关键词匹配解析
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


@router.post("/ai/splice/stream")
async def generate_muggle_splice_stream(request: MuggleSpliceRequest):
    """
    使用 DeepSeek Reasoner 生成麻瓜拼接方案（流式输出）
    支持实时显示推理过程
    """
    from app.core.config import settings
    import json
    import asyncio
    
    deepseek_key = settings.APIKEY_MacOS_Code_DeepSeek
    
    if not deepseek_key:
        raise HTTPException(
            status_code=500,
            detail="未配置 DeepSeek API 密钥"
        )
    
    async def event_generator():
        try:
            # 构建结构化提示词
            structured_prompt = build_structured_prompt(request, 0, [])
            
            # 构建请求数据
            data = {
                "model": "deepseek-reasoner",
                "messages": [
                    {"role": "system", "content": request.system_prompt},
                    {"role": "user", "content": structured_prompt}
                ],
                "temperature": 0.0,  # 代码生成/数学解题场景，需要准确结果
                "max_tokens": 4000,
                "stream": True,  # 启用流式输出
                "response_format": {
                    "type": "json_object"  # 强制 JSON 输出
                }
            }
            
            # 发送流式请求
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    "https://api.deepseek.com/chat/completions",
                    json=data,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {deepseek_key}"
                    }
                ) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        yield f"data: {json.dumps({'error': f'API 错误: {response.status_code}'})}\n\n"
                        return
                    
                    # 累积推理内容和最终内容
                    accumulated_reasoning = ""
                    accumulated_content = ""
                    
                    # 读取流式响应
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]  # 移除 "data: " 前缀
                            
                            if data_str.strip() == "[DONE]":
                                # 流结束，检查是否需要从 reasoning 中提取 JSON
                                if not accumulated_content or accumulated_content.strip() == "" or "null" in accumulated_content:
                                    logger.info(f"content 为空或包含 null，尝试从 reasoning 中提取 JSON")
                                    # 发送一个特殊标记，告诉前端从 reasoning 中提取
                                    yield f"data: {json.dumps({'type': 'extract_from_reasoning', 'reasoning': accumulated_reasoning})}\n\n"
                                
                                yield f"data: {json.dumps({'done': True})}\n\n"
                                break
                            
                            try:
                                chunk = json.loads(data_str)
                                delta = chunk.get("choices", [{}])[0].get("delta", {})
                                
                                # 推理过程（reasoning_content）
                                if "reasoning_content" in delta:
                                    reasoning = delta["reasoning_content"]
                                    accumulated_reasoning += reasoning
                                    yield f"data: {json.dumps({'type': 'reasoning', 'content': reasoning})}\n\n"
                                
                                # 最终内容（content）
                                if "content" in delta:
                                    content = delta["content"]
                                    # 过滤掉 null 值
                                    if content and content.strip() and content.strip() != "null":
                                        accumulated_content += content
                                        yield f"data: {json.dumps({'type': 'content', 'content': content})}\n\n"
                                
                            except json.JSONDecodeError:
                                continue
                        
                        await asyncio.sleep(0)  # 让出控制权
                        
        except Exception as e:
            logger.error(f"流式生成失败: {str(e)}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # 禁用 Nginx 缓冲
        }
    )
