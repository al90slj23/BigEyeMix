#!/usr/bin/env python3
"""
测试节拍对齐功能
"""
import asyncio
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(__file__))

from app.services.beat_sync_service import BeatSyncService
from app.services.transition_optimizer import transition_optimizer

async def test_beat_detection():
    """测试节拍检测"""
    print("=" * 60)
    print("测试节拍检测功能")
    print("=" * 60)
    
    service = BeatSyncService()
    
    # 查找测试音频文件
    upload_dir = "data/uploads"
    if not os.path.exists(upload_dir):
        print(f"❌ 上传目录不存在: {upload_dir}")
        return
    
    audio_files = [f for f in os.listdir(upload_dir) if f.endswith(('.mp3', '.flac', '.wav'))]
    
    if len(audio_files) < 2:
        print(f"❌ 需要至少2个音频文件进行测试，当前只有 {len(audio_files)} 个")
        return
    
    file1 = os.path.join(upload_dir, audio_files[0])
    file2 = os.path.join(upload_dir, audio_files[1])
    
    print(f"\n测试文件:")
    print(f"  文件1: {audio_files[0]}")
    print(f"  文件2: {audio_files[1]}")
    
    try:
        # 测试节拍检测
        print("\n[1/3] 检测文件1的节拍...")
        beat_info1 = service._detect_beats(file1)
        print(f"  ✓ BPM: {beat_info1['tempo']:.1f}")
        print(f"  ✓ 节拍数: {beat_info1['beat_count']}")
        print(f"  ✓ 时长: {beat_info1['duration']:.2f}s")
        
        print("\n[2/3] 检测文件2的节拍...")
        beat_info2 = service._detect_beats(file2)
        print(f"  ✓ BPM: {beat_info2['tempo']:.1f}")
        print(f"  ✓ 节拍数: {beat_info2['beat_count']}")
        print(f"  ✓ 时长: {beat_info2['duration']:.2f}s")
        
        # 测试兼容性分析
        print("\n[3/3] 分析过渡兼容性...")
        analysis = await transition_optimizer.analyze_compatibility(
            file1, file2, 'beatsync'
        )
        
        print(f"  ✓ 兼容性: {'是' if analysis['compatible'] else '否'}")
        print(f"  ✓ 置信度: {analysis['confidence']:.2%}")
        print(f"  ✓ 推荐: {analysis['recommendation']}")
        print(f"  ✓ 原因: {analysis['reason']}")
        if 'optimal_beats' in analysis:
            print(f"  ✓ 最佳节拍数: {analysis['optimal_beats']}")
        
        print("\n" + "=" * 60)
        print("✅ 节拍检测功能测试通过")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ 测试失败: {str(e)}")
        import traceback
        traceback.print_exc()

async def test_transition_optimizer():
    """测试过渡优化器"""
    print("\n" + "=" * 60)
    print("测试过渡优化器")
    print("=" * 60)
    
    upload_dir = "data/uploads"
    audio_files = [f for f in os.listdir(upload_dir) if f.endswith(('.mp3', '.flac', '.wav'))]
    
    if len(audio_files) < 2:
        print(f"❌ 需要至少2个音频文件")
        return
    
    file1 = os.path.join(upload_dir, audio_files[0])
    file2 = os.path.join(upload_dir, audio_files[1])
    
    try:
        print("\n推荐最佳过渡方案...")
        recommendation = await transition_optimizer.recommend_transition(file1, file2)
        
        print(f"  ✓ 推荐类型: {recommendation['recommendation']}")
        print(f"  ✓ 置信度: {recommendation['confidence']:.2%}")
        print(f"  ✓ 原因: {recommendation['reason']}")
        
        if 'alternatives' in recommendation:
            print(f"\n  备选方案:")
            for alt in recommendation['alternatives']:
                print(f"    - {alt['recommendation']} (置信度: {alt['confidence']:.2%})")
        
        print("\n" + "=" * 60)
        print("✅ 过渡优化器测试通过")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ 测试失败: {str(e)}")
        import traceback
        traceback.print_exc()

async def main():
    """主测试函数"""
    print("\n🎵 BigEyeMix 节拍对齐功能测试\n")
    
    await test_beat_detection()
    await test_transition_optimizer()
    
    print("\n✨ 所有测试完成\n")

if __name__ == "__main__":
    asyncio.run(main())
