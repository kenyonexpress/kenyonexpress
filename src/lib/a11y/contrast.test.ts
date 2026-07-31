import { describe, expect, it } from 'vitest'
import { AA, contrastRatio, hexToRgb, meetsAA, ratioLabel, relativeLuminance } from './contrast'

const BRAND_YELLOW = '#fed700'
const SALE_RED = '#dc3545' // measured off live; see tokens.ts
const BRIEF_RED = '#E4002B' // named in the brief, absent from the reference
const INK = '#333e48'
const WHITE = '#ffffff'
const BLACK = '#000000'

describe('the formula itself', () => {
  it('anchors on the two values the spec fixes', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5)
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5)
  })

  it('is symmetric, so an argument order cannot change a verdict', () => {
    expect(contrastRatio(BRAND_YELLOW, BLACK)).toBeCloseTo(contrastRatio(BLACK, BRAND_YELLOW), 10)
  })

  it('parses both hex forms and rejects anything else', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb('fed700')).toEqual({ r: 254, g: 215, b: 0 })
    expect(() => hexToRgb('#nothex')).toThrow()
  })

  it('puts brand yellow where its luminance says it is', () => {
    // Yellow is a LIGHT colour, 0.69 of the way to white. Every conclusion
    // below follows from this single number.
    expect(relativeLuminance(BRAND_YELLOW)).toBeGreaterThan(0.6)
  })
})

describe('brand yellow #fed700', () => {
  it('FAILS with white text, and not marginally', () => {
    // Around 1.4:1 against a 4.5:1 requirement. White on this yellow is close
    // to invisible for everyone, not only for low vision.
    expect(contrastRatio(WHITE, BRAND_YELLOW)).toBeLessThan(1.5)
    expect(meetsAA(WHITE, BRAND_YELLOW)).toBe(false)
    expect(meetsAA(WHITE, BRAND_YELLOW, 'large')).toBe(false)
  })

  it('passes comfortably with black or with the ink token', () => {
    expect(meetsAA(BLACK, BRAND_YELLOW)).toBe(true)
    expect(meetsAA(INK, BRAND_YELLOW)).toBe(true)
    expect(contrastRatio(INK, BRAND_YELLOW)).toBeGreaterThan(AA.normal)
  })

  it('has no legible edge against a white page', () => {
    // Why a yellow button needs a border or a shadow: the FILL is invisible
    // against white, so the control has no discernible boundary even when its
    // label is perfectly readable.
    expect(meetsAA(BRAND_YELLOW, WHITE, 'ui')).toBe(false)
  })
})

describe('the two reds', () => {
  it('the measured sale red passes on white', () => {
    expect(meetsAA(SALE_RED, WHITE)).toBe(true)
  })

  it("the brief's red also passes, so contrast is not why it was rejected", () => {
    // Measured: #E4002B is 4.85:1 and #dc3545 is 4.53:1. I had assumed the
    // brief's red failed and asserted it before measuring; this test caught
    // that. Recorded here so nobody re-opens the choice on accessibility
    // grounds. tokens.ts rejects it on FIDELITY: it appears zero times in the
    // reference the brief itself designates as the source of truth.
    expect(meetsAA(BRIEF_RED, WHITE)).toBe(true)
    expect(ratioLabel(BRIEF_RED, WHITE)).toBe('4.85:1')
  })

  it('the measured red clears AA by a margin thin enough to protect', () => {
    // 4.53:1 against a 4.5 threshold. Any darkening of the page background or
    // lightening of this red breaks it, so it is pinned rather than trusted.
    expect(contrastRatio(SALE_RED, WHITE)).toBeGreaterThanOrEqual(AA.normal)
    expect(contrastRatio(SALE_RED, WHITE)).toBeLessThan(4.7)
  })
})
