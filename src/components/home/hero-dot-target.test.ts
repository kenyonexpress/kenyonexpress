import { describe, expect, it } from 'vitest'
import { HERO_DOT_GEOMETRY, dotHitBox } from './HeroSlider'

/**
 * The hero dots are 8px wide, measured off the live slider, and each one
 * carries a bigger invisible button so a finger has something to hit. Grown
 * naively that button reaches 8px into the dot beside it, and the browser hands
 * an overlap to whichever button comes later in the DOM. The gap between the
 * dots is therefore derived from the button, not measured: 16px, the two
 * half-insets a pair of 24px boxes needs to touch without overlapping.
 *
 * Measured on the home page 2026-08-19 (Lighthouse `target-size`, stage 8): the
 * buttons for slides 2 and 3 both owned x199..207 -- the left half of the
 * VISIBLE dot for slide 2 -- so tapping slide 2's dot opened slide 3. This test
 * states the arithmetic that has to hold for that to be impossible, because it
 * is invisible on screen: the dots look identical either way.
 */
const { gap, idle, current } = HERO_DOT_GEOMETRY

/** Where a button's hit area starts and ends, relative to its layout box. */
function hitEdges(visible: number) {
  const box = dotHitBox(visible)
  const outer = box.width + 2 * box.marginInline
  return { start: box.marginInline, end: outer - box.marginInline, outer }
}

describe('hero dot tap targets', () => {
  it('gives the dot back exactly what the button took, so nothing moves', () => {
    for (const visible of [idle, current]) {
      expect(hitEdges(visible).outer).toBe(visible)
    }
  })

  it('never reaches into the neighbouring dot', () => {
    // Two idle dots side by side is the tightest pair on the strip.
    const left = hitEdges(idle)
    const right = hitEdges(idle)
    const overlap = -left.start + -right.start - gap
    expect(overlap).toBeLessThanOrEqual(0)
  })

  it('does not let the wide current dot reach into an idle neighbour either', () => {
    const overlap = -hitEdges(current).start + -hitEdges(idle).start - gap
    expect(overlap).toBeLessThanOrEqual(0)
  })

  it('gives every dot the full 24x24 Lighthouse target-size box', () => {
    // Lighthouse `target-size` (2026-10-20) reported the idle dot at 16x24
    // while the inline inset was capped at half an 8px gap. The rule passes on
    // size alone only when the box is 24x24 and no neighbour overlaps it.
    for (const visible of [idle, current]) {
      const box = dotHitBox(visible)
      expect(box.width).toBeGreaterThanOrEqual(24)
      expect(box.height).toBe(24)
    }
  })

  it('sizes the gap so two idle hit boxes touch exactly', () => {
    const idleBox = dotHitBox(idle)
    expect(gap).toBe(2 * -idleBox.marginInline)
    expect(gap).toBe(16)
  })
})
