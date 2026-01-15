# Fix Marquee Border Display Issue

## Problem Statement

The marquee border (彩虹跑马灯边框) for processing transitions is displaying incorrectly - it appears misaligned or behind the element instead of being visible on top.

### Current Behavior
- All processing blocks (crossfade, beatsync, magicfill, silence) should show an animated rainbow gradient border when in `processing` state
- The border was implemented using `::before` and `::after` pseudo-elements
- The `::before` creates the animated gradient border
- The `::after` is supposed to create a background layer
- However, the border is not visible or appears misaligned

### Expected Behavior
- When any processing block is added to the timeline and not yet completed, it should show a visible animated rainbow gradient border
- The border should be clearly visible on TOP of the element
- The animation should flow smoothly through all rainbow colors (red → orange → yellow → green → cyan → blue → purple → red)

## Terminology Updates

**Old Terms → New Terms:**
- "过渡类型" → "处理类型"
- "过渡时长（秒）" → "处理时长（秒）"
- "片段过渡" → "处理"
- "音频混剪拼接" → "拼接"
- "拼接预览" → "预览"
- "节拍对齐" → "节拍过渡"
- "淡出淡入" → "淡化过渡"
- "休止静音" → "静音填充"

**Processing Type Categories:**
- **Transitions (过渡)**: beatsync, crossfade - DO NOT add duration (overlap)
- **Fills (填充)**: magicfill, silence - DO add duration (insert)

## Root Cause Analysis

Looking at the CSS in `Muggle.timeline.css` (lines 410-450):

The `::before` and `::after` approach creates a complex stacking context that doesn't work reliably across browsers.

## Solution

Use a simpler, more reliable approach with animated `box-shadow` that cycles through rainbow colors.

## Implementation Plan

### Step 1: Update CSS (Muggle.timeline.css)

Replace the current `::before`/`::after` approach with a simpler box-shadow method that cycles through rainbow colors:

```css
.timeline-item.transition-item.magic-loading,
.timeline-item.transition-item.processing {
    position: relative;
    animation: rainbowMarqueeBorder 2s linear infinite, processingPulse 2s ease-in-out infinite;
}

@keyframes rainbowMarqueeBorder {
    0% { 
        box-shadow: 
            0 0 0 3px #ff0000,
            0 0 12px rgba(255, 0, 0, 0.6);
    }
    14% { 
        box-shadow: 
            0 0 0 3px #ffa500,
            0 0 12px rgba(255, 165, 0, 0.6);
    }
    28% { 
        box-shadow: 
            0 0 0 3px #ffff00,
            0 0 12px rgba(255, 255, 0, 0.6);
    }
    42% { 
        box-shadow: 
            0 0 0 3px #00ff00,
            0 0 12px rgba(0, 255, 0, 0.6);
    }
    57% { 
        box-shadow: 
            0 0 0 3px #00ffff,
            0 0 12px rgba(0, 255, 255, 0.6);
    }
    71% { 
        box-shadow: 
            0 0 0 3px #0000ff,
            0 0 12px rgba(0, 0, 255, 0.6);
    }
    85% { 
        box-shadow: 
            0 0 0 3px #8b00ff,
            0 0 12px rgba(139, 0, 255, 0.6);
    }
    100% { 
        box-shadow: 
            0 0 0 3px #ff0000,
            0 0 12px rgba(255, 0, 0, 0.6);
    }
}

@keyframes processingPulse {
    0%, 100% { opacity: 0.85; }
    50% { opacity: 1; }
}
```

### Step 2: Verify Processing State Logic (Muggle.timeline.js)

Ensure that ALL processing blocks (crossfade, beatsync, magicfill, silence) are correctly marked with `processing` class when not yet completed.

### Step 3: Update Terminology

Update all UI text to use new terminology:
- "处理类型" instead of "过渡类型"
- "处理时长（秒）" instead of "过渡时长（秒）"
- "处理" instead of "片段过渡"
- "拼接" instead of "音频混剪拼接"
- "预览" instead of "拼接预览"
- "节拍过渡" instead of "节拍对齐"
- "淡化过渡" instead of "淡出淡入"
- "静音填充" instead of "休止静音"

## Acceptance Criteria

- [ ] Rainbow marquee border is clearly visible on all processing blocks
- [ ] Border cycles through all rainbow colors (red → orange → yellow → green → cyan → blue → purple)
- [ ] Border animates smoothly in a flowing pattern
- [ ] Border does not clip or appear misaligned
- [ ] Border appears on TOP of the element, not behind it
- [ ] Normal transition animations (rainbow, pulse, breathing, stripes) still work correctly
- [ ] Playing state (progress bar) still works correctly with marquee border
- [ ] All terminology updated to new terms (处理, 拼接, 预览, etc.)

## Files Modified

1. `web/muggle/Muggle.timeline.css` - Updated marquee border CSS with rainbow animation
2. `web/muggle/Muggle.editor.js` - Updated "过渡" → "处理", "音频混剪拼接" → "拼接", "拼接预览" → "预览"
3. `web/muggle/Muggle.config.js` - Updated transition type names
4. `web/muggle/Muggle.timeline.drag.js` - Updated delete confirmation text
5. `web/muggle/index.mobile.html` - Updated modal text and bumped version to v=41

## Testing Steps

1. Upload two audio files (A1, B1)
2. Add A1 to timeline
3. Add a 3s beatsync transition - verify rainbow marquee border appears
4. Add B1 to timeline
5. Verify all processing blocks show rainbow border until completed
6. Test with crossfade, magicfill, and silence transitions
7. Verify all UI text uses new terminology

## Notes

- The marquee border should only appear for crossfade and beatsync (transitions that need audio processing)
- Magicfill uses `magic-loading` class (different from `processing`)
- Silence transitions don't need processing state
- The border should be visible even when the transition is playing (with progress bar)
