#!/usr/bin/env python3
"""
麻瓜拼接 AI 理解测试脚本
自动化测试多种场景，验证 AI 是否正确理解用户意图
"""

import asyncio
import json
import sys
from typing import Dict, List, Any
from app.api.muggle_splice import (
    build_structured_prompt,
    parse_and_validate_ai_response,
    MuggleSpliceRequest
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

# 测试场景定义
TEST_SCENARIOS = [
    {
        "name": "场景1：去掉中间某段",
        "description": "《知我》1分56～2分34这一段不要，剩下的部分《知我》＋《春颂》（整段）",
        "expected": {
            "clip_count": 3,  # A1前段 + A1后段 + B1
            "transition_count": 2,
            "has_custom_time": True,
            "instruction_pattern": ["clip", "transition", "clip", "transition", "clip"],
            "custom_ranges": [
                {"trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 116},
                {"trackId": "A", "clipId": "1", "customStart": 154, "customEnd": 192.28}
            ]
        }
    },
    {
        "name": "场景2：完整拼接",
        "description": "《知我》全部 + 《春颂》全部",
        "expected": {
            "clip_count": 2,  # A1 + B1
            "transition_count": 1,
            "has_custom_time": False,
            "instruction_pattern": ["clip", "transition", "clip"],
            "estimated_duration_range": (300, 310)  # 约5分钟
        }
    },
    {
        "name": "场景3：分段插入（关键场景）",
        "description": "把第一段音频分成1分钟、1分钟、1分钟这样的间隔，然后在每个中间都加入第二段音频",
        "expected": {
            "clip_count": 5,  # A1a + B1 + A1b + B1 + A1c
            "transition_count": 4,
            "has_custom_time": True,
            "instruction_pattern": ["clip", "transition", "clip", "transition", "clip", "transition", "clip", "transition", "clip"],
            "custom_ranges": [
                {"trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 60},
                {"trackId": "B", "clipId": "1"},  # 完整
                {"trackId": "A", "clipId": "1", "customStart": 60, "customEnd": 120},
                {"trackId": "B", "clipId": "1"},  # 完整
                {"trackId": "A", "clipId": "1", "customStart": 120, "customEnd": 180}
            ],
            "alternating_tracks": True  # A和B交替出现
        }
    },
    {
        "name": "场景4：分段插入静音",
        "description": "把第一段音频每隔30秒加入2秒静音",
        "expected": {
            "clip_count": 4,  # 至少4个30秒片段
            "transition_count": 3,  # 至少3个静音
            "has_custom_time": True,
            "instruction_pattern": ["clip", "transition", "clip", "transition", "clip", "transition", "clip"],
            "transition_type": "silence",
            "segment_duration": 30  # 每段30秒
        }
    },
    {
        "name": "场景5：多段拼接",
        "description": "《知我》前1分钟 + 《春颂》完整 + 《知我》后1分钟",
        "expected": {
            "clip_count": 3,
            "transition_count": 2,
            "has_custom_time": True,
            "instruction_pattern": ["clip", "transition", "clip", "transition", "clip"],
            "custom_ranges": [
                {"trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 60},
                {"trackId": "B", "clipId": "1"},  # 完整
                {"trackId": "A", "clipId": "1", "customStart": 132.28, "customEnd": 192.28}
            ]
        }
    },
    {
        "name": "场景6：重复片段",
        "description": "《知我》前30秒重复3次，中间加静音",
        "expected": {
            "clip_count": 3,
            "transition_count": 2,
            "has_custom_time": True,
            "instruction_pattern": ["clip", "transition", "clip", "transition", "clip"],
            "same_clip_repeated": True,
            "custom_ranges": [
                {"trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 30},
                {"trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 30},
                {"trackId": "A", "clipId": "1", "customStart": 0, "customEnd": 30}
            ]
        }
    }
]


def validate_scenario(scenario: Dict[str, Any], ai_response: str) -> Dict[str, Any]:
    """
    验证 AI 响应是否符合预期场景
    """
    result = {
        "scenario": scenario["name"],
        "description": scenario["description"],
        "passed": False,
        "errors": [],
        "warnings": [],
        "ai_response": ai_response
    }
    
    try:
        # 解析 AI 响应
        parsed = parse_and_validate_ai_response(ai_response, MOCK_CONTEXT)
        
        if not parsed["success"]:
            result["errors"].append(f"AI响应解析失败: {parsed['errors']}")
            return result
        
        instructions = parsed["instructions"]
        expected = scenario["expected"]
        
        # 验证指令数量
        clip_count = sum(1 for inst in instructions if inst.type == "clip")
        transition_count = sum(1 for inst in instructions if inst.type == "transition")
        
        if clip_count != expected["clip_count"]:
            result["errors"].append(f"片段数量错误: 期望 {expected['clip_count']}, 实际 {clip_count}")
        
        if transition_count != expected["transition_count"]:
            result["errors"].append(f"过渡数量错误: 期望 {expected['transition_count']}, 实际 {transition_count}")
        
        # 验证指令模式
        if "instruction_pattern" in expected:
            actual_pattern = [inst.type for inst in instructions]
            if actual_pattern != expected["instruction_pattern"]:
                result["errors"].append(
                    f"指令模式错误:\n  期望: {expected['instruction_pattern']}\n  实际: {actual_pattern}"
                )
        
        # 验证自定义时间范围
        if expected.get("has_custom_time"):
            clips_with_custom = [inst for inst in instructions if inst.type == "clip" and 
                               (inst.customStart is not None or inst.customEnd is not None)]
            if not clips_with_custom:
                result["errors"].append("缺少自定义时间范围（customStart/customEnd）")
        
        # 验证自定义范围的具体值
        if "custom_ranges" in expected:
            clip_instructions = [inst for inst in instructions if inst.type == "clip"]
            for i, expected_range in enumerate(expected["custom_ranges"]):
                if i >= len(clip_instructions):
                    result["errors"].append(f"缺少第 {i+1} 个片段")
                    continue
                
                actual_inst = clip_instructions[i]
                
                if actual_inst.trackId != expected_range["trackId"]:
                    result["errors"].append(
                        f"第 {i+1} 个片段轨道错误: 期望 {expected_range['trackId']}, 实际 {actual_inst.trackId}"
                    )
                
                if actual_inst.clipId != expected_range["clipId"]:
                    result["errors"].append(
                        f"第 {i+1} 个片段ID错误: 期望 {expected_range['clipId']}, 实际 {actual_inst.clipId}"
                    )
                
                # 检查自定义时间（如果期望有的话）
                if "customStart" in expected_range:
                    if actual_inst.customStart is None:
                        result["errors"].append(f"第 {i+1} 个片段缺少 customStart")
                    elif abs(actual_inst.customStart - expected_range["customStart"]) > 1:
                        result["warnings"].append(
                            f"第 {i+1} 个片段 customStart 偏差: 期望 {expected_range['customStart']}, 实际 {actual_inst.customStart}"
                        )
                
                if "customEnd" in expected_range:
                    if actual_inst.customEnd is None:
                        result["errors"].append(f"第 {i+1} 个片段缺少 customEnd")
                    elif abs(actual_inst.customEnd - expected_range["customEnd"]) > 1:
                        result["warnings"].append(
                            f"第 {i+1} 个片段 customEnd 偏差: 期望 {expected_range['customEnd']}, 实际 {actual_inst.customEnd}"
                        )
        
        # 验证交替轨道（用于分段插入场景）
        if expected.get("alternating_tracks"):
            clip_instructions = [inst for inst in instructions if inst.type == "clip"]
            track_ids = [inst.trackId for inst in clip_instructions]
            
            # 检查是否有A和B交替
            has_alternating = False
            for i in range(len(track_ids) - 1):
                if track_ids[i] != track_ids[i + 1]:
                    has_alternating = True
                    break
            
            if not has_alternating:
                result["errors"].append("缺少交替轨道（应该是 A-B-A-B 模式）")
        
        # 验证过渡类型
        if "transition_type" in expected:
            transitions = [inst for inst in instructions if inst.type == "transition"]
            wrong_types = [t for t in transitions if t.transitionType != expected["transition_type"]]
            if wrong_types:
                result["errors"].append(
                    f"过渡类型错误: 期望全部为 {expected['transition_type']}, 但有 {len(wrong_types)} 个不符合"
                )
        
        # 验证片段时长
        if "segment_duration" in expected:
            clip_instructions = [inst for inst in instructions if inst.type == "clip"]
            for i, inst in enumerate(clip_instructions):
                if inst.customStart is not None and inst.customEnd is not None:
                    duration = inst.customEnd - inst.customStart
                    if abs(duration - expected["segment_duration"]) > 2:
                        result["warnings"].append(
                            f"第 {i+1} 个片段时长偏差: 期望约 {expected['segment_duration']}s, 实际 {duration:.1f}s"
                        )
        
        # 验证预估时长范围
        if "estimated_duration_range" in expected:
            min_dur, max_dur = expected["estimated_duration_range"]
            actual_dur = parsed["estimated_duration"]
            if not (min_dur <= actual_dur <= max_dur):
                result["warnings"].append(
                    f"预估时长超出范围: 期望 {min_dur}~{max_dur}s, 实际 {actual_dur:.1f}s"
                )
        
        # 如果没有错误，标记为通过
        if not result["errors"]:
            result["passed"] = True
        
    except Exception as e:
        result["errors"].append(f"验证异常: {str(e)}")
    
    return result


async def test_scenario(scenario: Dict[str, Any]) -> Dict[str, Any]:
    """
    测试单个场景
    """
    print(f"\n{'='*60}")
    print(f"测试场景: {scenario['name']}")
    print(f"用户描述: {scenario['description']}")
    print(f"{'='*60}")
    
    # 构建请求
    request = MuggleSpliceRequest(
        prompt="",  # 会在 build_structured_prompt 中构建
        system_prompt="你是专业的音频拼接专家",
        context=MOCK_CONTEXT,
        user_description=scenario["description"]
    )
    
    # 构建提示词
    prompt = build_structured_prompt(request, 0, [])
    
    print(f"\n提示词长度: {len(prompt)} 字符")
    
    # 这里需要实际调用 AI API
    # 为了测试，我们先模拟一个响应
    # 在实际使用时，需要调用真实的 DeepSeek API
    
    print("\n⚠️  需要实际调用 AI API 进行测试")
    print("请手动运行以下命令测试:")
    print(f"  python -c 'import asyncio; from app.api.muggle_splice import generate_muggle_splice; asyncio.run(generate_muggle_splice(...))'")
    
    # 返回测试结果占位
    return {
        "scenario": scenario["name"],
        "description": scenario["description"],
        "passed": None,
        "errors": ["需要实际 AI API 调用"],
        "warnings": [],
        "prompt": prompt
    }


async def run_all_tests():
    """
    运行所有测试场景
    """
    print("="*60)
    print("麻瓜拼接 AI 理解测试")
    print("="*60)
    
    results = []
    
    for scenario in TEST_SCENARIOS:
        result = await test_scenario(scenario)
        results.append(result)
    
    # 生成测试报告
    print("\n" + "="*60)
    print("测试报告")
    print("="*60)
    
    passed_count = sum(1 for r in results if r.get("passed") == True)
    failed_count = sum(1 for r in results if r.get("passed") == False)
    pending_count = sum(1 for r in results if r.get("passed") is None)
    
    print(f"\n总计: {len(results)} 个场景")
    print(f"✅ 通过: {passed_count}")
    print(f"❌ 失败: {failed_count}")
    print(f"⏳ 待测: {pending_count}")
    
    # 详细结果
    for result in results:
        print(f"\n{'-'*60}")
        print(f"场景: {result['scenario']}")
        print(f"描述: {result['description']}")
        
        if result["passed"] == True:
            print("✅ 通过")
        elif result["passed"] == False:
            print("❌ 失败")
            if result["errors"]:
                print("\n错误:")
                for error in result["errors"]:
                    print(f"  • {error}")
        else:
            print("⏳ 待测试")
        
        if result.get("warnings"):
            print("\n警告:")
            for warning in result["warnings"]:
                print(f"  ⚠️  {warning}")
    
    # 保存测试报告
    report_file = "api/test_muggle_splice_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2, default=str)
    
    print(f"\n测试报告已保存到: {report_file}")
    
    return results


if __name__ == "__main__":
    asyncio.run(run_all_tests())
