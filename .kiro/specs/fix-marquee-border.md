# Fix Marquee Border Display Issue

## Problem Statement

The marquee border (跑马灯边框) for processing transitions is displaying incorrectly - it appears misaligned or behind the element instead of being visible on top.

### Current Behavior
- Crossfade and beatsync transitions should show an animated gradient border when in `processing` state
- The border is implemented using `::before` and `::after` pseudo-elements
- The `::before` creates the animated gradient border
- The `::after` is supposed to create a background layer
- However, the border is not visible or appears misaligned

### Expected Behavior
- When a crossfade or beatsync transition is added to the timeline, it should show a visible animated gradient border
- The border should be clearly visible on TOP of the element
- The animation should flow smoothly around the element

## Root Cause Analysis

Looking at the CSS in `Muggle.timeline.css` (lines 410-450):

```css
.timeline-item.transition-item.processing::before {
    content: '';
    position: absolute;
    top: -3px;
    left: -3px;
    right: -3px;
    bottom: -3px;
    border-radius: 10px;
    background: linear-gradient(90deg, 
        #667eea 0%, 
        #764ba2 25%, 
        #667eea 50%, 
        #764ba2 75%, 
        #667eea 100%);
    background-size: 200% 100%;
    animation: marqueeBorder 2s linear infinite;
    pointer-events: none;
}

.timeline-item.transition-item.processing::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 8px;
    background: inherit;
    pointer-events: none;
}
```

**Issues:**
1. The `::before` and `::after` approach creates a complex stacking context
2. The `background: inherit` on `::after` doesn't work correctly with animated backgrounds
3. The z-index layering is fragile and browser-dependent
4. The `.timeline-item` has `overflow: visible` but the pseudo-elements may still clip

## Solution

Use a simpler, more reliable approach with `box-shadow` or `border-image`:

### Option 1: Box-Shadow Approach (Recommended)
Use animated box-shadow with multiple layers to create the marquee effect.

### Option 2: Border-Image Approach
Use CSS `border-image` with gradient animation.

### Option 3: Wrapper Element Approach
Add a wrapper div in the HTML to separate border from content.

## Implementation Plan

### Step 1: Update CSS (Muggle.timeline.css)

Replace the current `::before`/`::after` approach with a simpler box-shadow method:

```css
.timeline-item.transition-item.magic-loading,
.timeline-item.transition-item.processing {
    position: relative;
    animation: processingPulse 2s ease-in-out infinite;
    box-shadow: 
        0 0 0 3px #667eea,
        0 0 12px rgba(102, 126, 234, 0.6);
    animation: marqueeBorder 2s linear infinite, processingPulse 2s ease-in-out infinite;
}

@keyframes marqueeBorder {
    0% { 
        box-shadow: 
            0 0 0 3px #667eea,
            0 0 12px rgba(102, 126, 234, 0.6);
    }
    25% { 
        box-shadow: 
            0 0 0 3px #764ba2,
            0 0 12px rgba(118, 75, 162, 0.6);
    }
    50% { 
        box-shadow: 
            0 0 0 3px #667eea,
            0 0 12px rgba(102, 126, 234, 0.6);
    }
    75% { 
        box-shadow: 
            0 0 0 3px #764ba2,
            0 0 12px rgba(118, 75, 162, 0.6);
    }
    100% { 
        box-shadow: 
            0 0 0 3px #667eea,
            0 0 12px rgba(102, 126, 234, 0.6);
    }
}
```

### Step 2: Verify Processing State Logic (Muggle.timeline.js)

Ensure that crossfade and beatsync transitions are correctly marked with `processing` class:

```javascript
// In renderTimeline() function
if ((transType === 'crossfade' || transType === 'beatsync') && !magicState) {
    if (item.transitionData && item.transitionData.nextFileId) {
        magicState = 'processing';
    } else {
        magicState = 'processing';
    }
}
```

### Step 3: Test All Transition Types

Test that all 4 transition types display correctly:
1. **magicfill** - rainbow gradient flow (normal state) + marquee border (loading state)
2. **beatsync** - pulse animation (normal state) + marquee border (processing state)
3. **crossfade** - breathing gradient (normal state) + marquee border (processing state)
4. **silence** - stripe animation (normal state, no processing state)

## Acceptance Criteria

- [ ] Marquee border is clearly visible on crossfade transitions
- [ ] Marquee border is clearly visible on beatsync transitions
- [ ] Border animates smoothly in a flowing gradient pattern
- [ ] Border does not clip or appear misaligned
- [ ] Border appears on TOP of the element, not behind it
- [ ] Normal transition animations (rainbow, pulse, breathing, stripes) still work correctly
- [ ] Playing state (progress bar) still works correctly with marquee border

## Files to Modify

1. `web/muggle/Muggle.timeline.css` - Update marquee border CSS (lines 410-450)
2. `web/muggle/Muggle.timeline.js` - Verify processing state logic (lines 50-80)
3. `web/muggle/index.mobile.html` - Bump version to v=41

## Testing Steps

1. Upload two audio files (A1, B1)
2. Add A1 to timeline
3. Add a 3s beatsync transition
4. Verify marquee border appears and animates
5. Add B1 to timeline
6. Verify marquee border updates or disappears (depending on implementation)
7. Repeat with crossfade transition
8. Verify magicfill and silence transitions still work correctly

## Notes

- The marquee border should only appear for crossfade and beatsync (transitions that need audio processing)
- Magicfill uses `magic-loading` class (different from `processing`)
- Silence transitions don't need processing state
- The border should be visible even when the transition is playing (with progress bar)
