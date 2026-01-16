# Crossfade Logic Fix Summary

## Problem Statement

The original TimelineManager implementation incorrectly handled crossfade transitions by:
1. Splitting clips into "main part" and "overlap part"
2. Reducing total duration by the crossfade duration
3. Creating complex segment structures

**Example (WRONG):**
- Clip A (30s) + Crossfade (3s) + Clip B (20s) = **47s total** (30 + 20 - 3)

## User Correction

The user clarified that crossfade should work as follows:
- **Crossfade is a volume fade effect, NOT a timeline overlap**
- 3s crossfade means:
  - Last 1.5s of Clip A (28.5-30s): fade out (volume 100% → 0%)
  - First 1.5s of Clip B (30-31.5s): fade in (volume 0% → 100%)
  - These are **SEQUENTIAL**, not overlapping
  - Total transition period = 1.5s + 1.5s = 3s
- **Total duration = sum of all clip durations** (no reduction)

**Example (CORRECT):**
- Clip A (30s) plays 0-30s, fades out during 28.5-30s
- Clip B (20s) plays 30-50s, fades in during 30-31.5s
- **Total = 50s** (30 + 20), transition period = 3s (sequential)

## Solution Implemented

### TimelineManager Changes

1. **Clips play at full duration**
   - No splitting into "main" and "overlap" parts
   - Each clip occupies its full duration in the timeline

2. **Crossfade as a marker**
   - `accumulatedStart = currentTime` (position between clips)
   - `accumulatedEnd = currentTime` (no duration)
   - `actualDuration = 0` (doesn't occupy timeline space)
   - `isCrossfadeMarker = true` (flag for identification)
   - `crossfadeDuration = duration` (saved for player reference)

3. **No timeline duration change**
   - `currentTime` is NOT modified when processing crossfade
   - Total duration = sum of all clip durations + magicfill/silence durations

### Code Changes

```javascript
// Before (WRONG):
currentTime -= duration;  // Rewind time to create overlap

// After (CORRECT):
// Crossfade doesn't change currentTime at all
// It's just a marker between two clips
```

## What Still Needs to Be Done

### Player Implementation

The current `PreviewPlayer` has a `scheduleCrossfade()` method that expects overlapping segments. This needs to be changed to:

1. **Modify `scheduleClip()` method**
   - Check if the clip has a crossfade marker before or after it
   - If crossfade before: apply fade-in gain to the beginning
   - If crossfade after: apply fade-out gain to the end

2. **Remove or update `scheduleCrossfade()` method**
   - Current implementation creates two overlapping sources
   - New approach: apply gain to individual clips, no overlap

3. **Gain application logic**
   ```javascript
   // For clip with fade-out at end:
   const fadeOutStart = clipDuration - crossfadeDuration / 2;
   gainNode.gain.setValueAtTime(1, scheduleTime + fadeOutStart);
   gainNode.gain.linearRampToValueAtTime(0, scheduleTime + clipDuration);
   
   // For clip with fade-in at start:
   const fadeInDuration = crossfadeDuration / 2;
   gainNode.gain.setValueAtTime(0, scheduleTime);
   gainNode.gain.linearRampToValueAtTime(1, scheduleTime + fadeInDuration);
   ```

### Timeline Data Structure

The crossfade `transitionData` structure is already correct:
- `prevFadeStart`: where fade-out starts in previous clip
- `prevFadeEnd`: end of previous clip
- `nextFadeStart`: start of next clip (usually 0)
- `nextFadeEnd`: where fade-in ends in next clip

This data can be used to determine which clips need gain adjustments.

## Testing Plan

1. **Test total duration calculation**
   - Verify that 30s + 3s crossfade + 20s = 50s (not 47s)

2. **Test playback**
   - Verify that Clip A plays for full 30s
   - Verify that Clip B starts at 30s (not 27s)
   - Verify that fade-out is applied to last 1.5s of Clip A
   - Verify that fade-in is applied to first 1.5s of Clip B

3. **Test waveform display**
   - Verify that waveform shows 50s total
   - Verify that segment bars show correct positions

## Current Status

✅ **DONE**: TimelineManager crossfade logic fixed
⏳ **TODO**: Player crossfade implementation needs update
⏳ **TODO**: Test with actual audio files
⏳ **TODO**: Update design document if needed

## Notes

- The user's feedback: "哪里重叠3秒啊.3秒淡化处理应该是前面1.5后面1.5,前面的1.5淡出,后面部分的1.5是淡入啊."
- This confirms that crossfade is split 50/50 (1.5s + 1.5s for 3s total)
- But these are NOT overlapping in the timeline - they're sequential
- The "overlap" is only in the volume fade effect, not in time
