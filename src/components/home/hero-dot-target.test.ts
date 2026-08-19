import { describe, expect, it } from 'vitest'
import { HERO_DOT_GEOMETRY, dotHitBox } from './HeroSlider'

/**
 * The hero dots are 8px wide with an 8px gap, both measured off the live
 * slider, and each one carries a bigger invisible button so a finger has
 * something to hit. Grown naively that button reaches 8px into the dot beside
 * it, and the browser hands an overlap to whichever button comes later in the
 * DOM.
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

  it('still grows the hit area well past the 8px dot', () => {
    const box = dotHitBox(idle)
    expect(box.width).toBeGreaterThan(idle)
    // Vertically there is no neighbour to collide with, so the full tap
    // minimum stands and must not be traded away with the horizontal cap.
    expect(box.height).toBe(24)
  })
})
