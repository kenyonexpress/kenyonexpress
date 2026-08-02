import { describe, expect, it } from 'vitest'
import {
  agorot,
  agorotToIls,
  formatIls,
  ilsToAgorot,
  moneyConstants,
  multiplyAgorot,
  percentToBasisPoints,
  percentageOf,
  sumAgorot,
} from './money'

describe('money', () => {
  it('converts exact ILS decimals to integer agorot', () => {
    expect(ilsToAgorot('33.33')).toBe(3_333)
    expect(ilsToAgorot('10')).toBe(1_000)
    expect(ilsToAgorot('-0.05')).toBe(-5)
  })

  it('rejects values with more than two decimal places', () => {
    expect(() => ilsToAgorot('1.005')).toThrow(
      'ILS value must be a decimal with at most two fraction digits',
    )
  })

  it('rounds percentage calculations half away from zero', () => {
    expect(percentageOf(agorot(9_999), 1_000)).toBe(1_000)
    expect(percentageOf(agorot(5), 1_000)).toBe(1)
    expect(percentageOf(agorot(-5), 1_000)).toBe(-1)
  })

  it('converts decimal percent to basis points', () => {
    expect(percentToBasisPoints('12.50')).toBe(1_250)
    expect(percentToBasisPoints(100)).toBe(10_000)
  })

  it('formats agorot as Hebrew ILS currency', () => {
    const formatted = formatIls(agorot(12_345))

    expect(formatted).toContain('123.45')
    expect(formatted).toContain('₪')
  })

  it('accepts a number as well as a string on the ILS boundary', () => {
    expect(ilsToAgorot(12.34)).toBe(1_234)
    expect(ilsToAgorot(12)).toBe(1_200)
    expect(ilsToAgorot(' 12.30 ')).toBe(1_230)
  })

  it('rejects an ILS value that is not a plain decimal', () => {
    for (const bad of ['', 'abc', '1,5', '1e3', '+1.00', '.5', '1.']) {
      expect(() => ilsToAgorot(bad), bad).toThrow(TypeError)
    }
  })

  it('round trips every value through agorot and back', () => {
    for (const value of ['0', '0.01', '9.99', '99.99', '100.00', '-5.50', '12345.67']) {
      expect(agorotToIls(ilsToAgorot(value))).toBeCloseTo(Number(value), 2)
    }
  })

  it('refuses to brand or read an unsafe integer', () => {
    expect(() => agorot(2 ** 53)).toThrow(RangeError)
    expect(() => agorot(1.5)).toThrow(RangeError)
    expect(() => agorotToIls((2 ** 53) as never)).toThrow(RangeError)
  })
})

describe('sumAgorot', () => {
  it('sums an empty list to zero', () => {
    expect(sumAgorot([])).toBe(0)
  })

  it('sums positive and negative lines exactly', () => {
    expect(sumAgorot([agorot(1_234), agorot(-234), agorot(1)])).toBe(1_001)
  })

  it('throws rather than overflowing past the safe integer range', () => {
    expect(() => sumAgorot([agorot(2 ** 53 - 1), agorot(2)])).toThrow(RangeError)
  })
})

describe('multiplyAgorot', () => {
  it('multiplies a unit price by a quantity', () => {
    expect(multiplyAgorot(agorot(3_333), 3)).toBe(9_999)
    expect(multiplyAgorot(agorot(1_000), 0)).toBe(0)
  })

  it('rejects a fractional quantity', () => {
    expect(() => multiplyAgorot(agorot(1_000), 1.5)).toThrow(RangeError)
  })

  it('throws rather than overflowing', () => {
    expect(() => multiplyAgorot(agorot(2 ** 40), 2 ** 20)).toThrow(RangeError)
  })
})

describe('percentToBasisPoints', () => {
  it('rejects a percent outside 0..100', () => {
    expect(() => percentToBasisPoints(100.01)).toThrow(RangeError)
    expect(() => percentToBasisPoints('-1')).toThrow(RangeError)
  })

  it('accepts the boundary percents', () => {
    expect(percentToBasisPoints(0)).toBe(0)
    expect(percentToBasisPoints('0.01')).toBe(1)
    expect(percentToBasisPoints('99.99')).toBe(9_999)
  })
})

describe('percentageOf', () => {
  it('rejects basis points outside 0..10000', () => {
    expect(() => percentageOf(agorot(1_000), -1)).toThrow(RangeError)
    expect(() => percentageOf(agorot(1_000), 10_001)).toThrow(RangeError)
    expect(() => percentageOf(agorot(1_000), 12.5)).toThrow(RangeError)
  })

  it('pins the edge percents on a 99.99 shekel line', () => {
    const line = agorot(9_999)
    expect(percentageOf(line, percentToBasisPoints(0))).toBe(0)
    expect(percentageOf(line, percentToBasisPoints('0.01'))).toBe(1)
    expect(percentageOf(line, percentToBasisPoints(10))).toBe(1_000)
    expect(percentageOf(line, percentToBasisPoints('12.5'))).toBe(1_250)
    expect(percentageOf(line, percentToBasisPoints('33.33'))).toBe(3_333)
    expect(percentageOf(line, percentToBasisPoints('99.99'))).toBe(9_998)
    expect(percentageOf(line, percentToBasisPoints(100))).toBe(9_999)
  })

  it('throws rather than overflowing on the intermediate product', () => {
    expect(() => percentageOf(agorot(2 ** 50), 10_000)).toThrow(RangeError)
  })

  /**
   * The single most important money invariant: splitting a line into a platform
   * slice and a supplier slice must not create or destroy a single agora, at
   * any percent and at any amount.
   */
  it('allocates a line into two slices that sum back to the exact total', () => {
    for (let total = 0; total <= 2_000; total += 7) {
      for (const percent of ['0', '0.01', '7.5', '10', '12.5', '33.33', '99.99', '100']) {
        const bps = percentToBasisPoints(percent)
        const platform = percentageOf(agorot(total), bps)
        const supplier = total - platform

        expect(platform + supplier, `${total} @ ${percent}%`).toBe(total)
        expect(platform).toBeGreaterThanOrEqual(0)
        expect(supplier).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('moneyConstants', () => {
  it('exposes the conversion bases the engines rely on', () => {
    expect(moneyConstants.agorotPerIls).toBe(100)
    expect(moneyConstants.basisPointsPerPercent).toBe(100)
    expect(moneyConstants.basisPointsPerWhole).toBe(10_000)
  })
})
