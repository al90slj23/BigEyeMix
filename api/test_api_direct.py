#!/usr/bin/env python3
"""
直接测试麻瓜拼接 API
"""

import httpx
import json
import asyncio

API_URL = "https://bem.it.sc.cn/api/ai/splice"

# 模拟上下文数据
mock_context = {
    "tracks": [
        {
            "id": 0,
            "label": "A",
            "name": "知我.mp3",
            "duration": 192.28,
            "clips": [
                {"id": 1, "start": 0, "end": 192.28, "duration": 192.28}
            ]
        },
        {
            "id": 1,
            "label": "B",
            "name": "春颂.flac",
            "duration": 116.6,
            "clips": [
                {"id": 1, "start": 0, "end": 116.6, "duration": 116.6}
            ]
        }
    ],
    "availableTransitions": [
        {"type": "crossfade", "name": "淡化过渡", "description": "两段音频平滑过渡"},
        {"type": "beatsync", "name": "节拍过渡", "description": "按节拍对齐过渡"},
        {"type": "magicfill", "name": "魔法填充", "description": "AI生成过渡音频"},
        {"type": "silence", "name": "静音填充", "description": "插入静音间隔"}
    ]
}

test_cases = [
    {
        "name": "简单拼接",
        "description": "把第一段和第二段拼接起来"
    },
    {
        "name": "分段交替",
        "description": "把第一段分成3份，把第二段分成2份，然后把他们交替摆开"
    },
    {
        "name": "去掉中间某段",
        "description": "第一段音频1分56到2分34这一段不要，剩下的部分加上第二段完整音频"
    },
    {
        "name": "分段插入",
        "description": "把第一段音频分成1分钟、1分钟、1分钟这样的间隔，然后在每个中间都加入第二段音频"
    },
    {
        "name": "静音间隔",
        "description": "把第一段音频每隔30秒加入2秒静音"
    }
]

async def test_api(test_case):
    """测试单个场景"""
    print(f"\n{'='*60}")
    print(f"测试场景: {test_case['name']}")
    print(f"描述: {test_case['description']}")
    print(f"{'='*60}")
    
    system_prompt = """你是专业的音频拼接专家，擅长理解用户的自然语言描述并转换为结构化的音频拼接指令。你必须严格按照JSON格式返回结果，确保所有指令都是可执行的。"""
    
    prompt = f"""你是专业的音频拼接专家。请根据用户描述生成详细的拼接方案。

可用音频文件:
A (知我.mp3): 总时长 03:12.28
    可用片段: A1 (00:00.00 - 03:12.28, 时长 03:12.28)
B (春颂.flac): 总时长 01:56.60
    可用片段: B1 (00:00.00 - 01:56.60, 时长 01:56.60)

可用处理类型:
- 淡化过渡 (crossfade): 两段音频平滑过渡
- 节拍过渡 (beatsync): 按节拍对齐过渡
- 魔法填充 (magicfill): AI生成过渡音频
- 静音填充 (silence): 插入静音间隔

用户描述: "{test_case['description']}"

请严格按照以下JSON格式返回拼接方案：

```json
{{
  "explanation": "详细的拼接方案说明",
  "instructions": [
    {{
      "type": "clip",
      "trackId": "轨道ID", 
      "clipId": "片段ID"
    }},
    {{
      "type": "transition",
      "transitionType": "crossfade|beatsync|magicfill|silence",
      "duration": 处理时长数值
    }}
  ],
  "estimated_duration": 预估总时长数值
}}
```

只返回JSON，不要添加其他说明文字。"""
    
    payload = {
        "prompt": prompt,
        "system_prompt": system_prompt,
        "context": mock_context,
        "user_description": test_case['description']
    }
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(API_URL, json=payload)
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ API 调用成功")
                print(f"\n说明:")
                print(result.get('explanation', '无说明')[:200] + "...")
                
                if result.get('instructions'):
                    print(f"\n指令数量: {len(result['instructions'])}")
                    clip_count = sum(1 for i in result['instructions'] if i.get('type') == 'clip')
                    trans_count = sum(1 for i in result['instructions'] if i.get('type') == 'transition')
                    print(f"  - Clip 指令: {clip_count}")
                    print(f"  - Transition 指令: {trans_count}")
                
                if result.get('validation_errors'):
                    print(f"\n⚠️ 验证警告:")
                    for error in result['validation_errors']:
                        print(f"  - {error}")
                
                if result.get('retry_count'):
                    print(f"\n🔄 重试次数: {result['retry_count']}")
                
                return True
            else:
                print(f"❌ API 调用失败: {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"错误详情: {error_data.get('detail', '无详情')}")
                except:
                    print(f"错误内容: {response.text[:200]}")
                return False
                
    except Exception as e:
        print(f"❌ 请求异常: {str(e)}")
        return False

async def run_tests():
    """运行所有测试"""
    print("\n" + "="*60)
    print("麻瓜拼接 API 测试")
    print("="*60)
    
    passed = 0
    failed = 0
    
    for test_case in test_cases:
        result = await test_api(test_case)
        if result:
            passed += 1
        else:
            failed += 1
        
        # 等待一下避免请求过快
        await asyncio.sleep(2)
    
    # 总结
    print(f"\n{'='*60}")
    print(f"测试总结")
    print(f"{'='*60}")
    print(f"✅ 通过: {passed}")
    print(f"❌ 失败: {failed}")
    print(f"总计: {passed + failed}")
    print(f"{'='*60}\n")
    
    return failed == 0

if __name__ == "__main__":
    success = asyncio.run(run_tests())
    exit(0 if success else 1)
 