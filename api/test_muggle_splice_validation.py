#!/usr/bin/env python3
"""
测试麻瓜拼接 API 的验证逻辑
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.api.muggle_splice import validate_semantic_logic, StructuredAIResponse, ClipInstruction, TransitionInstruction
from typing import List, Union

# 模拟上下文数据（两个音频文件）
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
    ]
}

def test_case(name: str, instructions: List[Union[ClipInstruction, TransitionInstruction]], estimated_duration: float):
    """测试单个场景"""
    print(f"\n{'='*60}")
    print(f"测试场景: {name}")
    print(f"{'='*60}")
    
    response = StructuredAIResponse(
        explanation=f"测试场景: {name}",
        instructions=instructions,
        estimated_duration=estimated_duration
    )
    
    errors = validate_semantic_logic(response, mock_context)
    
    if errors:
        print(f"❌ 验证失败:")
        for error in errors:
            print(f"   - {error}")
        return False
    else:
        print(f"✅ 验证通过")
        print(f"   预估时长: {estimated_duration:.1f}s")
        return True

def run_tests():
    """运行所有测试"""
    print("\n" + "="*60)
    print("麻瓜拼接验证逻辑测试")
    print("="*60)
    
    passed = 0
    failed = 0
    
    # 测试1: 简单拼接 - A1 + 过渡 + B1
    result = test_case(
        "简单拼接 (A1 + 3s淡化 + B1)",
        [
            ClipInstruction(type="clip", trackId="A", clipId="1"),
            TransitionInstruction(type="transition", transitionType="crossfade", duration=3),
            ClipInstruction(type="clip", trackId="B", clipId="1")
        ],
        estimated_duration=192.28 + 116.6 - 3  # crossfade 减少时长
    )
    if result:
        passed += 1
    else:
        failed += 1
    
    # 测试2: 使用数字 ID
    result = test_case(
        "使用数字 trackId 和 clipId",
        [
            ClipInstruction(type="clip", trackId=0, clipId=1),
            TransitionInstruction(type="transition", transitionType="crossfade", duration=3),
            ClipInstruction(type="clip", trackId=1, clipId=1)
        ],
        estimated_duration=192.28 + 116.6 - 3
    )
    if result:
        passed += 1
    else:
        failed += 1
    
    # 测试3: 分段拼接 - A1前半段 + B1 + A1后半段
    result = test_case(
        "分段拼接 (A1前半 + 3s淡化 + B1 + 3s淡化 + A1后半)",
        [
            ClipInstruction(type="clip", trackId="A", clipId="1", customStart=0, customEnd=96.14),
            TransitionInstruction(type="transition", transitionType="crossfade", duration=3),
            ClipInstruction(type="clip", trackId="B", clipId="1"),
            TransitionInstruction(type="transition", transitionType="crossfade", duration=3),
            ClipInstruction(type="clip", trackId="A", clipId="1", customStart=96.14, customEnd=192.28)
        ],
        estimated_duration=96.14 + 116.6 + 96.14 - 6  # 两个 crossfade
    )
    if result:
        passed += 1
    else:
        failed += 1
    
    # 测试4: 交替拼接 - A分3份，B分2份，交替摆开
    result = test_case(
        "交替拼接 (A1a + B1a + A1b + B1b + A1c)",
        [
            ClipInstruction(type="clip", trackId="A", clipId="1", customStart=0, customEnd=64),
            TransitionInstruction(type="transition", transitionType="crossfade", duration=3),
            ClipInstruction(type="clip", trackId="B", clipId="1", customStart=0, customEnd=58),
            TransitionInstruction(type="transition", transitionType="crossfade", duration=3),
            ClipInstruction(type="clip", trackId="A", clipId="1", customStart=64, customEnd=128),
            TransitionInstruction(type="transition", transitionType="crossfade", duration=3),
            ClipInstruction(type="clip", trackId="B", clipId="1", customStart=58, customEnd=116.6),
            TransitionInstruction(type="transition", transitionType="crossfade", duration=3),
            ClipInstruction(type="clip", trackId="A", clipId="1", customStart=128, customEnd=192.28)
        ],
        estimated_duration=64 + 58 + 64 + 58.6 + 64.28 - 12  # 4个 crossfade
    )
    if result:
        passed += 1
    else:
        failed += 1
    
    # 测试5: 使用魔法填充（增加时长）
    result = test_case(
        "魔法填充 (A1 + 5s魔法填充 + B1)",
        [
            ClipInstruction(type="clip", trackId="A", clipId="1"),
            TransitionInstruction(type="transition", transitionType="magicfill", duration=5),
            ClipInstruction(type="clip", trackId="B", clipId="1")
        ],
        estimated_duration=192.28 + 5 + 116.6  # magicfill 增加时长
    )
    if result:
        passed += 1
    else:
        failed += 1
    
    # 测试6: 使用静音填充
    result = test_case(
        "静音填充 (A1前30s + 2s静音 + A1中30s + 2s静音 + A1后30s)",
        [
            ClipInstruction(type="clip", trackId="A", clipId="1", customStart=0, customEnd=30),
            TransitionInstruction(type="transition", transitionType="silence", duration=2),
            ClipInstruction(type="clip", trackId="A", clipId="1", customStart=30, customEnd=60),
            TransitionInstruction(type="transition", transitionType="silence", duration=2),
            ClipInstruction(type="clip", trackId="A", clipId="1", customStart=60, customEnd=90)
        ],
        estimated_duration=30 + 2 + 30 + 2 + 30  # silence 增加时长
    )
    if result:
        passed += 1
    else:
        failed += 1
    
    # 测试7: 错误场景 - 不存在的轨道
    result = test_case(
        "错误场景: 不存在的轨道ID",
        [
            ClipInstruction(type="clip", trackId="C", clipId="1"),
        ],
        estimated_duration=100
    )
    if not result:  # 期望失败
        passed += 1
        print("   ✅ 正确检测到错误")
    else:
        failed += 1
        print("   ❌ 应该检测到错误但没有")
    
    # 测试8: 错误场景 - 不存在的片段
    result = test_case(
        "错误场景: 不存在的片段ID",
        [
            ClipInstruction(type="clip", trackId="A", clipId="99"),
        ],
        estimated_duration=100
    )
    if not result:  # 期望失败
        passed += 1
        print("   ✅ 正确检测到错误")
    else:
        failed += 1
        print("   ❌ 应该检测到错误但没有")
    
    # 测试9: 错误场景 - 时长差异过大
    result = test_case(
        "错误场景: 预估时长与实际差异过大",
        [
            ClipInstruction(type="clip", trackId="A", clipId="1"),
            TransitionInstruction(type="transition", transitionType="crossfade", duration=3),
            ClipInstruction(type="clip", trackId="B", clipId="1")
        ],
        estimated_duration=1000  # 明显错误的时长
    )
    if not result:  # 期望失败
        passed += 1
        print("   ✅ 正确检测到错误")
    else:
        failed += 1
        print("   ❌ 应该检测到错误但没有")
    
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
    success = run_tests()
    sys.exit(0 if success else 1)
