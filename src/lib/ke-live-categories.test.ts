import { KE_LIVE_CATEGORIES, UNDER_99_LABEL } from '@/lib/ke-live-hero-data'
import { describe, expect, it } from 'vitest'

/**
 * COMPONENT 03 OF `docs/COMPONENT-QUEUE.md`: THE DEPARTMENTS MENU.
 *
 * THERE IS NO MEGA PANEL, AND THAT IS A MEASUREMENT AND NOT AN OMISSION.
 *
 * The queue row for 03 reads "Departments menu + mega panel", keyed to Electro's
 * `departments-menu-v2`. Electro's version of that block is a `yamm` dropdown:
 * every department opens a full-width panel of sub-departments. Live's version
 * does not. Measured against the live homepage on 2026-09-04 by walking the
 * `<li>` elements inside `.home-vertical-nav.departments-menu-v2`:
 *
 *   11 items, and `menu-item-has-children` on NONE of them.
 *
 * Live's own `sub-menu` count on the whole page is zero. The departments menu
 * there is a flat list of eleven links, which is exactly what this list is.
 *
 * The queue's governing rule decides it: "the live site wins on which sections
 * exist and Electro wins on how each one is laid out", and the queue already
 * refuses `section-product-cards-carousel` and friends on the same grounds --
 * a block with no live counterpart is not built. Building Electro's panel here
 * would also have to INVENT the sub-departments to fill it, since live has none
 * to source, and invented navigation is Electro demo content by another name.
 *
 * So 03 is the flat list, laid out with Electro's geometry, and this test pins
 * the two properties that a future session would otherwise have to re-derive
 * from the live site: the exact list, and its flatness.
 */

/**
 * Live's departments, read off the rendered homepage in live's own order.
 *
 * Two entries differ from live's text on purpose and both are recorded rather
 * than silently normalised:
 *
 *   - `עד ₪99` on live is `עד 99 ₪` here. Live puts the shekel sign to the LEFT
 *     of the digits, which is the defect `money-format.ts` exists to prevent;
 *     the label is built through `shekelsRounded` so it reads digits-then-sign
 *     inside an LTR isolate, like every other price on the site.
 *   - live's `עד ₪99` and `החדשים` both point at `#`, a dead href. They point at
 *     real category routes here.
 */
const LIVE_DEPARTMENTS = [
  'דילים חמים 🔥',
  UNDER_99_LABEL,
  'החדשים',
  'מסעדות ובתי קפה',
  'יופי בריאות וטיפוח',
  'טלפונים מחשבים ואביזרים',
  'תינוקות וילדים',
  'צימרים ובתי מלון',
  'ציוד ומזון לבעלי חיים',
  'בעלי מקצוע',
  'קורסים Express – בקרוב . . .',
]

describe('the departments menu', () => {
  it("is live's eleven departments, in live's order", () => {
    expect(KE_LIVE_CATEGORIES.map((c) => c.label)).toEqual(LIVE_DEPARTMENTS)
  })

  it('is flat: live has no sub-departments, so neither does this', () => {
    // The shape check rather than a comment: if anyone adds children to feed an
    // Electro mega panel, the source for them is not live.
    for (const category of KE_LIVE_CATEGORIES) {
      expect(Object.keys(category).sort(), `${category.slug} grew a subtree`).not.toContain(
        'children',
      )
    }
  })

  it('sends every department somewhere real, unlike live', () => {
    // Live's `עד ₪99` and `החדשים` are href="#".
    for (const category of KE_LIVE_CATEGORIES) {
      const href = category.href ?? `/category/${category.slug}`
      expect(href, `${category.slug} is a dead link`).toMatch(/^\/category\/[a-z0-9-]+$/)
    }
  })

  it('writes the price label with the sign after the digits', () => {
    // Live reads `עד ₪99`. The RTL money rule is digits, then sign, isolated.
    expect(UNDER_99_LABEL).toMatch(/99\s*₪/)
    expect(UNDER_99_LABEL).not.toMatch(/₪\s*99/)
  })
})
