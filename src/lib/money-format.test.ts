import { agorot } from '@/lib/money'
import {
  repairPriceOrder,
  shekels,
  shekelsFromIls,
  shekelsFromIlsCompact,
  shekelsFromIlsCompactPlain,
  shekelsFromIlsPlain,
  shekelsFromIlsPlainRounded,
  shekelsFromIlsRounded,
  shekelsPlain,
  shekelsRounded,
} from '@/lib/money-format'
import { describe, expect, it } from 'vitest'

/**
 * THE SHEKEL SIGN RENDERS TO THE RIGHT OF THE DIGITS.
 *
 * The defect: `₪99.00` in a `dir="rtl"` document lays the sign out to the LEFT
 * of the number, because `₪` is bidi class ET and a run of ETs adjacent to
 * European digits joins the number as one left-to-right run. Every price on the
 * site read with the sign on the wrong side.
 *
 * The trap, and the reason this file exists rather than a one-line reorder:
 * `99.00 ₪` with a plain space is ALSO wrong. The space is a neutral character,
 * the algorithm resolves it against the RTL paragraph, and the sign migrates
 * back across the digits. Measured in Chromium, both orderings, inside a Hebrew
 * sentence; the table is in the header of `money-format.ts`. So is the
 * measurement showing that `Intl.NumberFormat('he-IL', {currency: 'ILS'})`
 * produces the LEFT-hand arrangement too, which is why the fix is not "use
 * Intl".
 *
 * What holds it is U+2066 LRI ... U+2069 PDI: one left-to-right run that no
 * surrounding text can reorder.
 */

const LRI = '⁦'
const PDI = '⁩'
const NBSP = ' '

describe('shekels', () => {
  it.each([
    [0, `0.00${NBSP}₪`],
    [99, `0.99${NBSP}₪`],
    [9900, `99.00${NBSP}₪`],
    [999900, `9,999.00${NBSP}₪`],
    [-9900, `-99.00${NBSP}₪`],
  ])('formats %i agorot', (value, body) => {
    expect(shekels(agorot(value))).toBe(`${LRI}${body}${PDI}`)
  })

  it('puts the digits before the sign, always', () => {
    // The assertion the defect report is about, stated on its own so it cannot
    // be lost in a fixture rewrite: whatever else changes, digit precedes sign.
    for (const value of [0, 99, 9900, 999900, -9900]) {
      const text = shekelsPlain(agorot(value))
      expect(text.search(/\d/)).toBeLessThan(text.indexOf('₪'))
    }
  })

  it('isolates the price so surrounding Hebrew cannot reorder it', () => {
    const price = shekels(agorot(9900))
    expect(price.startsWith(LRI)).toBe(true)
    expect(price.endsWith(PDI)).toBe(true)
    // And the space inside is non-breaking: a plain space is the one that lets
    // the sign migrate, measured.
    expect(price).toContain(NBSP)
    expect(price).not.toContain(' ')
  })

  it('never produces a float on the way to the string', () => {
    // 1/3 of a shekel cannot exist in agorot, and the formatter must not invent
    // one: 3333 agorot is 33.33, not 33.329999999999998.
    expect(shekelsPlain(agorot(3333))).toBe(`33.33${NBSP}₪`)
    expect(shekelsPlain(agorot(1))).toBe(`0.01${NBSP}₪`)
    expect(shekelsPlain(agorot(10))).toBe(`0.10${NBSP}₪`)
  })

  it('groups thousands the Hebrew locale way', () => {
    expect(shekelsPlain(agorot(123456789))).toBe(`1,234,567.89${NBSP}₪`)
  })
})

describe('shekelsPlain', () => {
  it('is the same string without the invisible isolate characters', () => {
    const value = agorot(9900)
    expect(shekels(value)).toBe(`${LRI}${shekelsPlain(value)}${PDI}`)
    expect(shekelsPlain(value)).not.toContain(LRI)
    expect(shekelsPlain(value)).not.toContain(PDI)
  })
})

describe('shekelsRounded', () => {
  it.each([
    [0, `0${NBSP}₪`],
    [99, `1${NBSP}₪`],
    [9900, `99${NBSP}₪`],
    [999900, `9,999${NBSP}₪`],
  ])('rounds %i agorot to whole shekels', (value, body) => {
    expect(shekelsRounded(agorot(value))).toBe(`${LRI}${body}${PDI}`)
  })

  it('rounds half up, so a cart of 99.60 reads 100 and not 99', () => {
    expect(shekelsRounded(agorot(9960))).toBe(`${LRI}100${NBSP}₪${PDI}`)
  })

  it('floors a negative to zero, which is the header badge it exists for', () => {
    // Documented, not accidental: this formats the cart-count badge, and a cart
    // total cannot be negative. A refund is never rendered through this one.
    expect(shekelsRounded(agorot(-9900))).toBe(`${LRI}0${NBSP}₪${PDI}`)
  })
})

describe('shekelsFromIls', () => {
  it.each([
    [99, `99.00${NBSP}₪`],
    ['99', `99.00${NBSP}₪`],
    ['99.5', `99.50${NBSP}₪`],
    [0, `0.00${NBSP}₪`],
    [null, `0.00${NBSP}₪`],
    [undefined, `0.00${NBSP}₪`],
    ['not-a-number', `0.00${NBSP}₪`],
    [Number.POSITIVE_INFINITY, `0.00${NBSP}₪`],
  ])('formats %p', (value, body) => {
    expect(shekelsFromIls(value)).toBe(`${LRI}${body}${PDI}`)
  })

  it('groups thousands the Hebrew locale way', () => {
    expect(shekelsFromIls(123456.7)).toBe(`${LRI}123,456.70${NBSP}₪${PDI}`)
  })
})

describe('shekelsFromIlsRounded', () => {
  it.each([
    [99, `99${NBSP}₪`],
    ['99.6', `100${NBSP}₪`],
    [0, `0${NBSP}₪`],
    [null, `0${NBSP}₪`],
    [undefined, `0${NBSP}₪`],
    ['not-a-number', `0${NBSP}₪`],
    [Number.POSITIVE_INFINITY, `0${NBSP}₪`],
  ])('rounds %p to whole shekels', (value, body) => {
    expect(shekelsFromIlsRounded(value)).toBe(`${LRI}${body}${PDI}`)
  })
})

describe('shekelsFromIlsPlain', () => {
  it('is shekelsFromIls with the isolate characters stripped', () => {
    expect(shekelsFromIlsPlain(99)).toBe(`99.00${NBSP}₪`)
    expect(shekelsFromIlsPlain(99)).not.toContain(LRI)
    expect(shekelsFromIlsPlain(99)).not.toContain(PDI)
  })
})

describe('shekelsFromIlsPlainRounded', () => {
  it('is shekelsFromIlsRounded with the isolate characters stripped', () => {
    expect(shekelsFromIlsPlainRounded(99.6)).toBe(`100${NBSP}₪`)
    expect(shekelsFromIlsPlainRounded(99.6)).not.toContain(LRI)
    expect(shekelsFromIlsPlainRounded(99.6)).not.toContain(PDI)
  })
})

describe('shekelsFromIlsCompact', () => {
  it('drops the fraction when the price is whole', () => {
    expect(shekelsFromIlsCompact(399)).toBe(`${LRI}399${NBSP}₪${PDI}`)
  })

  it('keeps the fraction when the price has one', () => {
    expect(shekelsFromIlsCompact(399.5)).toBe(`${LRI}399.5${NBSP}₪${PDI}`)
  })

  it.each([
    [null, `0${NBSP}₪`],
    [undefined, `0${NBSP}₪`],
    ['not-a-number', `0${NBSP}₪`],
    ['250', `250${NBSP}₪`],
  ])('handles %p', (value, body) => {
    expect(shekelsFromIlsCompact(value)).toBe(`${LRI}${body}${PDI}`)
  })
})

describe('shekelsFromIlsCompactPlain', () => {
  it('is shekelsFromIlsCompact with the isolate characters stripped', () => {
    expect(shekelsFromIlsCompactPlain(399)).toBe(`399${NBSP}₪`)
    expect(shekelsFromIlsCompactPlain(399)).not.toContain(LRI)
    expect(shekelsFromIlsCompactPlain(399)).not.toContain(PDI)
  })
})

describe('repairPriceOrder', () => {
  it('rewrites a sign-first price to digits-then-sign, isolated', () => {
    expect(repairPriceOrder('עד ₪99 בלבד')).toBe(`עד ${LRI}99${NBSP}₪${PDI} בלבד`)
  })

  it('leaves text with no price untouched', () => {
    expect(repairPriceOrder('קטגוריה רגילה')).toBe('קטגוריה רגילה')
  })

  it('leaves a price already written digits-first untouched', () => {
    expect(repairPriceOrder(`99${NBSP}₪`)).toBe(`99${NBSP}₪`)
  })

  it('handles grouped and decimal digits, and a space between sign and digits', () => {
    expect(repairPriceOrder('₪1,234.50')).toBe(`${LRI}1,234.50${NBSP}₪${PDI}`)
    expect(repairPriceOrder('₪ 99')).toBe(`${LRI}99${NBSP}₪${PDI}`)
  })

  it('rewrites every match when a string has more than one', () => {
    expect(repairPriceOrder('₪10 או ₪20')).toBe(`${LRI}10${NBSP}₪${PDI} או ${LRI}20${NBSP}₪${PDI}`)
  })
})
