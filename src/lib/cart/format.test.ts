import { agorot } from '@/lib/money'
import { shekels, shekelsPlain, shekelsRounded } from '@/lib/money-format'
import { describe, expect, it } from 'vitest'

/** U+2066 LRI ... U+2069 PDI. See the header of money-format.ts. */
const wrap = (body: string) => `\u2066${body}\u2069`

/**
 * The display half of the agorot bug.
 *
 * Four cart components each carried a private `shekels(value: number)` that ran
 * `toLocaleString` straight on the number. While `buildCartView` was dividing
 * by 100 on the way out those helpers were right by accident; the moment the
 * division was removed they overstated every price a hundredfold. These
 * assertions pin the conversion to the one shared formatter so a component
 * cannot quietly grow its own again.
 */

describe('shekels', () => {
  it('converts agorot to shekels rather than printing them raw', () => {
    expect(shekels(agorot(20_000))).toBe(wrap('200.00\u00a0₪'))
    expect(shekels(agorot(10_000))).toBe(wrap('100.00\u00a0₪'))
  })

  it('keeps the agorot remainder', () => {
    expect(shekelsPlain(agorot(9_999))).toBe('99.99\u00a0₪')
    expect(shekelsPlain(agorot(1))).toBe('0.01\u00a0₪')
    expect(shekelsPlain(agorot(0))).toBe('0.00\u00a0₪')
  })

  it('pads a single-digit remainder so it never reads as tens', () => {
    // 1205 agorot is 12.05, not 12.5.
    expect(shekelsPlain(agorot(1_205))).toBe('12.05\u00a0₪')
  })

  it('groups thousands', () => {
    expect(shekelsPlain(agorot(123_456))).toBe('1,234.56\u00a0₪')
  })

  it('signs a negative amount once, ahead of the digits', () => {
    expect(shekelsPlain(agorot(-2_550))).toBe('-25.50\u00a0₪')
  })

  /**
   * THIS ASSERTION USED TO SAY THE OPPOSITE, and it was measured wrong.
   *
   * It read "emits no directional marks, which reorder a price inside RTL
   * text", pinned the output to the string with the sign first, and forbade
   * U+200E/U+200F/U+061C on the grounds that Intl's currency style injects
   * them and that they reorder a price sitting next to Hebrew.
   *
   * What that missed is that the reordering happens WITHOUT any marks. The
   * shekel glyph is bidi class ET, and a run of ETs adjacent to European digits
   * joins them into one left-to-right run -- so sign-first in an RTL paragraph
   * puts the sign to the LEFT of the number all by itself. Measured in Chromium
   * inside the sentence "עד ... בלבד"; the full table is in money-format.ts,
   * including the row showing Intl's own he-IL/ILS output landing the same
   * wrong way.
   *
   * Marks were never the hazard. Unmanaged neutrals were. The price now ships
   * inside U+2066 LRI ... U+2069 PDI, which are isolates rather than marks, and
   * which pin the run left-to-right so neither the space nor the surrounding
   * Hebrew can move the sign.
   */
  it('isolates the price rather than leaving its direction to the paragraph', () => {
    const output = shekels(agorot(12_345))
    expect(output).toBe(wrap('123.45\u00a0₪'))

    // Digits before the sign, which is the whole point.
    const plain = shekelsPlain(agorot(12_345))
    expect(plain.search(/\d/)).toBeLessThan(plain.indexOf('₪'))

    // Isolates, not marks: the marks the old assertion forbade stay forbidden.
    expect(/[\u200e\u200f\u061c]/.test(output)).toBe(false)
  })
})

describe('shekelsRounded', () => {
  it('drops the agorot for the header badge', () => {
    expect(shekelsRounded(agorot(20_000))).toBe(wrap('200\u00a0₪'))
  })

  it('rounds half up rather than truncating', () => {
    // ₪99.60 reads ₪100, not ₪99.
    expect(shekelsRounded(agorot(9_960))).toBe(wrap('100\u00a0₪'))
    expect(shekelsRounded(agorot(9_950))).toBe(wrap('100\u00a0₪'))
    expect(shekelsRounded(agorot(9_949))).toBe(wrap('99\u00a0₪'))
  })

  it('groups thousands', () => {
    expect(shekelsRounded(agorot(1_234_567))).toBe(wrap('12,346\u00a0₪'))
  })

  it('shows an empty cart as zero', () => {
    expect(shekelsRounded(agorot(0))).toBe(wrap('0\u00a0₪'))
    expect(shekelsRounded(agorot(-500))).toBe(wrap('0\u00a0₪'))
  })
})
