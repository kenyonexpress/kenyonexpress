import { shekels, shekelsRounded } from '@/lib/cart/format'
import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'

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
    expect(shekels(agorot(20_000))).toBe('₪200.00')
    expect(shekels(agorot(10_000))).toBe('₪100.00')
  })

  it('keeps the agorot remainder', () => {
    expect(shekels(agorot(9_999))).toBe('₪99.99')
    expect(shekels(agorot(1))).toBe('₪0.01')
    expect(shekels(agorot(0))).toBe('₪0.00')
  })

  it('pads a single-digit remainder so it never reads as tens', () => {
    // 1205 agorot is ₪12.05, not ₪12.5.
    expect(shekels(agorot(1_205))).toBe('₪12.05')
  })

  it('groups thousands', () => {
    expect(shekels(agorot(123_456))).toBe('₪1,234.56')
  })

  it('signs a negative amount once, before the glyph', () => {
    expect(shekels(agorot(-2_550))).toBe('-₪25.50')
  })

  it('emits no directional marks, which reorder a price inside RTL text', () => {
    const output = shekels(agorot(12_345))
    expect(output).toBe('₪123.45')
    // U+200E/U+200F/U+061C are what Intl's currency style would inject here.
    expect(/[‎‏؜]/.test(output)).toBe(false)
  })
})

describe('shekelsRounded', () => {
  it('drops the agorot for the header badge', () => {
    expect(shekelsRounded(agorot(20_000))).toBe('₪200')
  })

  it('rounds half up rather than truncating', () => {
    // ₪99.60 reads ₪100, not ₪99.
    expect(shekelsRounded(agorot(9_960))).toBe('₪100')
    expect(shekelsRounded(agorot(9_950))).toBe('₪100')
    expect(shekelsRounded(agorot(9_949))).toBe('₪99')
  })

  it('groups thousands', () => {
    expect(shekelsRounded(agorot(1_234_567))).toBe('₪12,346')
  })

  it('shows an empty cart as zero', () => {
    expect(shekelsRounded(agorot(0))).toBe('₪0')
    expect(shekelsRounded(agorot(-500))).toBe('₪0')
  })
})
