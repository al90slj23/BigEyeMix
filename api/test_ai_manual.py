#!/usr/bin/env python3
"""
手动测试 AI 理解 - 实际调用 DeepSeek API
使用方法: python api/test_ai_manual.py
"""

import asyncio
import json
import os
import sys
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

from app.api.muggle_splice import (
    MuggleSpliceRequest,
    generate_muggle_splice
)

# 测试用的模拟音频上下文
MOCK_CONTEXT = {
    "tracks": [
        {
            "id": "A",
            "label": "A",
            "name": "知我（抒情版）.mp3",
            "duration": 192.28,  # 3分12秒
            "clips": [
                {
                    "id": "1",
                    "start": 0,
                    "end": 192.28,
                    "duration": 192.28
                }
            ]
        },
        {
            "id": "B",
            "label": "B",
            "name": "春颂.flac",
            "duration": 116.60,  # 1分56秒
            "clips": [
                {
                    "id": "1",
                    "start": 0,
                    "end": 116.60,
                    "duration": 116.60
                }
            ]
        }
    ]
}

# 测试场景
TEST_CASES = [
    {
        "name": "场景1：去掉中间某段",
        "description": "《知我》1分56～2分34这一段不要，剩下的部分《知我》＋《春颂》（整段）"
    },
    {
        "name": "场景2：完整拼接",
        "description": "《知我》全部 + 《春颂》全部"
    },
    {
        "name": "场景3：分段插入（关键）",
        "description": "把第一段音频分成1分钟、1分钟、1分钟这样的间隔，然后在每个中间都加入第二段音频"
    },
    {
        "name": "场景4：分段插入静音",
        "description": "把第一段音频每隔30秒加入2秒静音"
    },
    {
        "name": "场景5：用户原始输入",
        "description": "把第一段，音频，分成，1分钟，1分钟，1分钟这样的间隔，然后在每个中间都加入第二段音频"
    }
]


def format_instructions(instructions):
    """格式化指令输出"""
    if not instructions:
        return "无指令"
    
    result = []
    for i, inst in enumerate(instructions, 1):
        if inst["type"] == "clip":
            track_id = inst["trackId"]
            clip_id = inst["clipId"]
            custom_info = ""
            if "customStart" in inst or "customEnd" in inst:
                start = inst.get("customStart", "默认")
                end = inst.get("customEnd", "默认")
                custom_info = f" ({start}s ~ {end}s)"
            result.append(f"  {i}. 片段: {track_id}{clip_id}{custom_info}")
        elif inst["type"] == "transition":
            trans_type = inst["transitionType"]
            duration = inst["duration"]
            type_names = {
                "crossfade": "淡化过渡",
                "beatsync": "节拍过渡",
                "magicfill": "魔法填充",
                "silence": "静音填充"
            }
            result.append(f"  {i}. 过渡: {type_names.get(trans_type, trans_type)} ({duration}s)")
    
    return "\n".join(result)


async def test_single_case(test_case):
    """测试单个场景"""
    print(f"\n{'='*70}")
    print(f"🧪 {test_case['name']}")
    print(f"{'='*70}")
    print(f"📝 用户描述: {test_case['description']}")
    print()
    
    # 构建请求
    request = MuggleSpliceRequest(
        prompt="",
        system_prompt="你是专业的音频拼接专家，擅长理解用户的自然语言描述并转换为结构化的音频拼接指令。",
        context=MOCK_CONTEXT,
        user_description=test_case["description"]
    )
    
    try:
        # 调用 AI 生成
        print("⏳ 正在调用 AI API...")
        result = await generate_muggle_splice(request)
        
        print(f"\n✅ AI 响应成功")
        print(f"{'─'*70}")
        
        # 显示解释
        print(f"\n💡 AI 理解:")
        print(result.explanation)
        
        # 显示指令
        if result.instructions:
            print(f"\n📋 生成的指令 (共 {len(result.instructions)} 条):")
            print(format_instructions(result.instructions))
            
            # 统计
            clip_count = sum(1 for inst in result.instructions if inst["type"] == "clip")
            transition_count = sum(1 for inst in result.instructions if inst["type"] == "transition")
            print(f"\n📊 统计: {clip_count} 个片段, {transition_count} 个过渡")
        else:
            print("\n⚠️  未生成指令")
        
        # 显示验证信息
        if result.validation_errors:
            print(f"\n⚠️  验证警告:")
            for error in result.validation_errors:
                print(f"  • {error}")
        
        # 显示重试信息
        if result.retry_count and result.retry_count > 0:
            print(f"\n🔄 经过 {result.retry_count + 1} 次尝试生成")
        
        return {
            "success": True,
            "result": result
        }
        
    except Exception as e:
        print(f"\n❌ 测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e)
        }


async def run_all_tests():
    """运行所有测试"""
    print("="*70)
    print("🎵 麻瓜拼接 AI 理解测试")
    print("="*70)
    
    # 检查 API 密钥
    deepseek_key = os.getenv('APIKEY_MacOS_Code_DeepSeek')
    moonshot_key = os.getenv('APIKEY_MacOS_Code_MoonShot')
    
    if not deepseek_key and not moonshot_key:
        print("\n❌ 错误: 未配置 AI API 密钥")
        print("请设置环境变量:")
        print("  export APIKEY_MacOS_Code_DeepSeek='your_key'")
        print("  或")
        print("  export APIKEY_MacOS_Code_MoonShot='your_key'")
        return
    
    if deepseek_key:
        print(f"✅ 使用 DeepSeek API")
    else:
        print(f"✅ 使用 MoonShot API")
    
    results = []
    
    # 运行每个测试场景
    for test_case in TEST_CASES:
        result = await test_single_case(test_case)
        results.append({
            "name": test_case["name"],
            "description": test_case["description"],
            **result
        })
        
        # 等待一下，避免 API 限流
        await asyncio.sleep(1)
    
    # 生成总结
    print(f"\n{'='*70}")
    print("📊 测试总结")
    print(f"{'='*70}")
    
    success_count = sum(1 for r in results if r.get("success"))
    total_count = len(results)
    
    print(f"\n总计: {total_count} 个场景")
    print(f"✅ 成功: {success_count}")
    print(f"❌ 失败: {total_count - success_count}")
    
    # 保存详细报告
    report_file = "api/test_ai_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2, default=str)
    
    print(f"\n📄 详细报告已保存到: {report_file}")


if __name__ == "__main__":
    asyncio.run(run_all_tests())
