import { describe, expect, it } from 'vitest'
import {
  agorot,
  agorotFromDb,
  agorotFromDbOrNull,
  agorotFromIlsColumn,
  agorotFromIlsColumnOr,
  agorotFromIlsNumber,
  agorotFromShekelInput,
  agorotToDecimalString,
  agorotToWholeShekelString,
  applyBp,
  bp,
  bpFromPercentColumn,
  bpToPercentString,
  bpToShortPercentString,
  divRoundHalfUp,
  extractVat,
  fixedDecimal,
  ilsFromIlsColumn,
  numberFromInput,
  percentFromColumn,
  percentToBp,
  ratioToPercentString,
} from './money'

/**
 * C194: the boundary helpers in money.ts (C141) are where a value enters or
 * leaves the integer-agorot world. The per-file coverage floor on this module
 * (95%) had not been enforced while the coverage provider crashed; once it ran
 * it read 87.85% lines / 69.4% branches. These pin each branch.
 */

describe('basis points and rounding guards', () => {
  it('rejects out-of-range and non-integer basis points', () => {
    expect(() => bp(-1)).toThrow(RangeError)
    expect(() => bp(10_001)).toThrow(RangeError)
    expect(() => bp(1.5)).toThrow(RangeError)
    expect(bp(0)).toBe(0)
    expect(bp(10_000)).toBe(10_000)
  })

  it('parses percent strings and refuses non-finite input', () => {
    expect(percentToBp('33.33')).toBe(3333)
    expect(percentToBp(12.5)).toBe(1250)
    expect(() => percentToBp('abc')).toThrow(TypeError)
    expect(() => percentToBp(Number.POSITIVE_INFINITY)).toThrow(TypeError)
  })

  it('divides half away from zero for both signs', () => {
    expect(divRoundHalfUp(5, 2)).toBe(3)
    expect(divRoundHalfUp(-5, 2)).toBe(-3)
    expect(divRoundHalfUp(4, 3)).toBe(1)
    expect(() => divRoundHalfUp(1, 0)).toThrow(RangeError)
    expect(() => divRoundHalfUp(1.5, 2)).toThrow(RangeError)
  })

  it('applies a rate and refuses a negative one', () => {
    expect(applyBp(agorot(10_000), 1250)).toBe(1250)
    expect(() => applyBp(agorot(100), -1)).toThrow(RangeError)
  })

  it('splits VAT loss-free and validates the rate', () => {
    const split = extractVat(agorot(11_800))
    expect(split).toEqual({ gross: 11_800, net: 10_000, vat: 1_800, vatRateBp: 1800 })
    expect(() => extractVat(agorot(100), -1)).toThrow(RangeError)
    expect(() => extractVat(agorot(100), 10_001)).toThrow(RangeError)
  })
})

describe('agorotFromDb', () => {
  it('reads integers, bigints and integer strings', () => {
    expect(agorotFromDb(4990)).toBe(4990)
    expect(agorotFromDb(49.6)).toBe(50)
    expect(agorotFromDb(BigInt(12_345))).toBe(12_345)
    expect(agorotFromDb(' -250 ')).toBe(-250)
  })

  it('rounds legacy fractional strings on the first fraction digit', () => {
    expect(agorotFromDb('10.5')).toBe(11)
    expect(agorotFromDb('10.4')).toBe(10)
    expect(agorotFromDb('-10.5')).toBe(-11)
    expect(agorotFromDb('-0.4')).toBe(0)
  })

  it('falls back on non-finite, unparseable and other types', () => {
    expect(agorotFromDb(Number.NaN, 7)).toBe(7)
    expect(agorotFromDb('abc', 3)).toBe(3)
    expect(agorotFromDb(null)).toBe(0)
    expect(agorotFromDb({}, 9)).toBe(9)
  })

  it('keeps a missing value null in the OrNull variant', () => {
    expect(agorotFromDbOrNull(null)).toBeNull()
    expect(agorotFromDbOrNull(undefined)).toBeNull()
    expect(agorotFromDbOrNull('')).toBeNull()
    expect(agorotFromDbOrNull('120')).toBe(120)
  })
})

describe('shekel number and column reads', () => {
  it('converts through the shortest decimal form', () => {
    expect(agorotFromIlsNumber(49.9)).toBe(4990)
    expect(agorotFromIlsNumber(1.005)).toBe(101)
    expect(agorotFromIlsNumber(-3.5)).toBe(-350)
    expect(agorotFromIlsNumber(1e-7)).toBe(0)
  })

  it('refuses non-finite and out-of-range numbers', () => {
    expect(() => agorotFromIlsNumber(Number.NaN)).toThrow(TypeError)
    expect(() => agorotFromIlsNumber(1e300)).toThrow(RangeError)
  })

  it('reads numeric columns as number, string or null', () => {
    expect(agorotFromIlsColumn(null)).toBeNull()
    expect(agorotFromIlsColumn(undefined)).toBeNull()
    expect(agorotFromIlsColumn(400)).toBe(40_000)
    expect(agorotFromIlsColumn(Number.NaN)).toBeNull()
    expect(agorotFromIlsColumn('49.90')).toBe(4990)
    expect(agorotFromIlsColumn('.5')).toBe(50)
    expect(agorotFromIlsColumn('7.')).toBe(700)
    expect(agorotFromIlsColumn('.')).toBeNull()
    expect(agorotFromIlsColumn('12abc')).toBeNull()
    expect(agorotFromIlsColumn(true)).toBeNull()
    expect(agorotFromIlsColumn('99999999999999999999')).toBeNull()
  })

  it('applies the fallback and derives display shekels', () => {
    expect(agorotFromIlsColumnOr(null, 500)).toBe(500)
    expect(agorotFromIlsColumnOr('1.25')).toBe(125)
    expect(agorotFromIlsColumnOr(undefined)).toBe(0)
    expect(ilsFromIlsColumn('49.90')).toBe(49.9)
    expect(ilsFromIlsColumn(null)).toBeNull()
  })
})

describe('outgoing strings', () => {
  it('formats agorot as a two-decimal shekel string', () => {
    expect(agorotToDecimalString(4990)).toBe('49.90')
    expect(agorotToDecimalString(5)).toBe('0.05')
    expect(agorotToDecimalString(-350)).toBe('-3.50')
  })

  it('formats agorot as whole shekels, half away from zero', () => {
    expect(agorotToWholeShekelString(4950)).toBe('50')
    expect(agorotToWholeShekelString(4949)).toBe('49')
    expect(agorotToWholeShekelString(-4950)).toBe('-50')
  })
})

describe('admin shekel input', () => {
  it('accepts whole shekels, decimals, separators and the sign', () => {
    expect(agorotFromShekelInput('1,299')).toBe(129_900)
    expect(agorotFromShekelInput(' ₪ 49.90 ')).toBe(4990)
    expect(agorotFromShekelInput(49)).toBe(4900)
  })

  it('returns null for empty, invalid and non-finite input', () => {
    expect(agorotFromShekelInput(null)).toBeNull()
    expect(agorotFromShekelInput(undefined)).toBeNull()
    expect(agorotFromShekelInput('')).toBeNull()
    expect(agorotFromShekelInput(' ₪ ')).toBeNull()
    expect(agorotFromShekelInput('abc')).toBeNull()
    expect(agorotFromShekelInput(Number.NaN)).toBeNull()
  })
})

describe('percent columns and strings', () => {
  it('reads percent columns to basis points', () => {
    expect(bpFromPercentColumn('12.5')).toBe(1250)
    expect(bpFromPercentColumn(85)).toBe(8500)
    expect(bpFromPercentColumn(null)).toBeNull()
    expect(bpFromPercentColumn('')).toBeNull()
    expect(bpFromPercentColumn(Number.NaN)).toBeNull()
    expect(bpFromPercentColumn('x')).toBeNull()
  })

  it('reads percent columns to a plain percent', () => {
    expect(percentFromColumn('12.5')).toBe(12.5)
    expect(percentFromColumn(null)).toBeNull()
  })

  it('renders basis points at 0, 1 and 2 decimals', () => {
    expect(bpToPercentString(1250)).toBe('12.50')
    expect(bpToPercentString(1250, 1)).toBe('12.5')
    expect(bpToPercentString(1255, 1)).toBe('12.6')
    expect(bpToPercentString(1250, 0)).toBe('13')
    expect(bpToPercentString(-1250)).toBe('-12.50')
  })

  it('renders the shortest exact percent', () => {
    expect(bpToShortPercentString(8500)).toBe('85')
    expect(bpToShortPercentString(1250)).toBe('12.5')
    expect(bpToShortPercentString(1234)).toBe('12.34')
  })
})

describe('non-money display helpers', () => {
  it('renders ratios and guards a zero whole', () => {
    expect(ratioToPercentString(1, 3)).toBe('33.33')
    expect(ratioToPercentString(1, 3, 0)).toBe('33')
    expect(ratioToPercentString(5, 0)).toBe('0')
  })

  it('fixes decimals and guards non-finite values', () => {
    expect(fixedDecimal(1.23456, 2)).toBe('1.23')
    expect(fixedDecimal(Number.NaN, 2)).toBe('0')
  })

  it('reads form values with a fallback', () => {
    expect(numberFromInput(5)).toBe(5)
    expect(numberFromInput(Number.POSITIVE_INFINITY, 1)).toBe(1)
    expect(numberFromInput(' 12.5 ')).toBe(12.5)
    expect(numberFromInput('', 2)).toBe(2)
    expect(numberFromInput('   ', 2)).toBe(2)
    expect(numberFromInput('abc', 3)).toBe(3)
    expect(numberFromInput(null, 4)).toBe(4)
  })
})
