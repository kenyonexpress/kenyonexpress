import { agorot } from '@/lib/money'
import { shekels, shekelsPlain, shekelsRounded } from '@/lib/money-format'
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
