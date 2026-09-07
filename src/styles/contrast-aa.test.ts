import { describe, expect, it } from 'vitest'
import { OFF_PAGE, SITE } from './tokens'

/**
 * WCAG 2.1 AA CONTRAST, COMPUTED FROM THE TOKENS RATHER THAN ASSERTED ABOUT THEM.
 *
 * This file exists because `tokens.ts` already carries the reasoning and had no
 * way to enforce it. Two of its colours were darkened for exactly this: `muted`
 * because `#767676` was 4.54 on white but 4.16 on the `#f5f5f5` panels the
 * product page uses, and `saleBadge` because the live site's green was 2.58 and
 * failed even the 3:1 large-text floor. Both notes are prose. A later edit that
 * lightened either one back would have passed every test in the repo.
 *
 * THE TRAP THIS ENCODES, and it is the one that caught `muted`: a ratio is a
 * property of a PAIR, not of a colour. `#e4002b` is 4.85 on white and 4.44 on
 * `#f5f5f5`, so "the price red passes AA" is only true until somebody puts a
 * price on a tinted card. Each pair below therefore names its surface.
 *
 * WHICH FLOOR APPLIES. 4.5:1 for body text, 3:1 for large text (18.66px bold or
 * 24px regular) and for non-text UI under WCAG 1.4.11. The mini-cart's remove
 * button renders `#e4002b` on `#fef2f2` at 4.43, which would fail as text and
 * passes here because it is an icon-only button with an `aria-label` and no
 * text in it at all. That distinction is recorded rather than left for the next
 * person to re-derive.
 */

/** Relative luminance, WCAG 2.x definition. */
function luminance(hex: string): number {
  const c = hex.replace('#', '')
  const channels = [0, 2, 4]
    .map((i) => Number.parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

const AA_TEXT = 4.5
const AA_LARGE = 3

/** Surfaces a token is actually painted on, taken from tokens.ts itself. */
const WHITE = SITE.surface.page
const PANEL_HOVER = SITE.surface.hover

describe('contrast, computed', () => {
  it('agrees with a known pair, so the maths itself is not the thing under test', () => {
    // Black on white is exactly 21:1 by definition. If this drifts, every other
    // number in this file is wrong and the failures below would be noise.
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })
})

describe('the brand yellow is only ever used with dark ink', () => {
  it('brand yellow with the dark ink clears AA body text', () => {
    expect(contrast(SITE.brand.primary, SITE.brand.dark)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('the hover yellow clears it too, so a hover is not a contrast cliff', () => {
    expect(contrast(SITE.brand.primaryHover, SITE.brand.dark)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('white on the brand yellow is catastrophic, which is why nothing does it', () => {
    // 1.41:1. Recorded as a fact rather than a hope: every `bg-brand` button in
    // the repo pairs with `text-heading`, and the ones whose hover turns the
    // text white turn the BACKGROUND dark in the same rule. If a future button
    // sets white on yellow, this number is what it would be getting.
    expect(contrast(SITE.brand.primary, '#ffffff')).toBeLessThan(AA_LARGE)
  })
})

describe('the price red, per surface', () => {
  it('clears AA body text on white, which is where prices are rendered', () => {
    expect(contrast(WHITE, OFF_PAGE.brandRed)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('does NOT clear AA body text on the hover tint, so no price may sit there', () => {
    // 4.44:1. This is not a bug today: `#f5f5f5` is used for a close button's
    // hover and nothing else, and no price renders on it. It is pinned so that
    // moving a price onto a tinted card fails here rather than in an audit.
    expect(contrast(PANEL_HOVER, OFF_PAGE.brandRed)).toBeLessThan(AA_TEXT)
    expect(contrast(PANEL_HOVER, OFF_PAGE.brandRed)).toBeGreaterThanOrEqual(AA_LARGE)
  })

  it('clears the non-text floor on the red tint the remove icon uses', () => {
    // `.mini-cart__item-remove:hover` paints `#e4002b` on `#fef2f2` at 4.43.
    // It is an icon-only button carrying an aria-label, so WCAG 1.4.11's 3:1
    // is the applicable floor and it passes with room.
    expect(contrast('#fef2f2', OFF_PAGE.brandRed)).toBeGreaterThanOrEqual(AA_LARGE)
  })
})

describe('the two colours that were already darkened for AA stay darkened', () => {
  it('muted clears AA on white AND on the panel it failed on', () => {
    // The whole reason `#767676` became `#6f6f6f`: it passed on white at 4.54
    // and failed at 4.16 on the product page's panels, where axe called it
    // serious. One value had to cover both surfaces.
    expect(contrast(WHITE, SITE.neutral.muted)).toBeGreaterThanOrEqual(AA_TEXT)
    expect(contrast('#f5f5f5', SITE.neutral.muted)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('the sale badge clears AA in both directions, which the live green did not', () => {
    // The live site's green was 2.58 and failed even the 3:1 large-text floor.
    // This is the one place the palette deliberately overrides match-the-live-site.
    expect(contrast(WHITE, SITE.functional.saleBadge)).toBeGreaterThanOrEqual(AA_TEXT)
    expect(contrast(SITE.functional.saleBadge, '#ffffff')).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('the link blue clears AA body text on white', () => {
    expect(contrast(WHITE, SITE.functional.link)).toBeGreaterThanOrEqual(AA_TEXT)
  })
})
