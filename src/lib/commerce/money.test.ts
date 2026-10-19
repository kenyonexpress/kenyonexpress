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

  it('round trips every value through agorot and back, EXACTLY', () => {
    // `toBeCloseTo(x, 2)` was here, and it is the one matcher that would hide
    // the bug this module exists to prevent: it passes for any error under
    // 0.005, which is half an agora. A round trip through an integer
    // representation is not approximately correct, it is correct, so the
    // assertion is now equality and the tolerance is gone.
    for (const value of ['0', '0.01', '9.99', '99.99', '100.00', '-5.50', '12345.67']) {
      expect(agorotToIls(ilsToAgorot(value))).toBe(Number(value))
    }
  })

  it('is exact on the values IEEE-754 addition gets wrong', () => {
    // WHERE THE SAFETY ACTUALLY COMES FROM, measured rather than assumed.
    //
    // I first wrote this claiming the integer split (`whole * 100 + fraction`)
    // is what prevents float error, then substituted `Math.round(Number(s) *
    // 100)` into money.ts to prove it. All 25 tests passed. The two forms are
    // equivalent for every input the regex admits, because float error at two
    // decimal places is ~1e-13 and rounding absorbs it.
    //
    // So the guard is the REGEX, not the arithmetic. `/^(-?)(\d+)(?:\.(\d{1,2}))?$/`
    // is what refuses a third decimal, a comma, an exponent and a bare dot, and
    // the integer split is defence in depth behind it. Asserting the regex is
    // therefore the assertion that matters, and it is the one below.
    expect(0.1 + 0.2).not.toBe(0.3) // the float this module exists to avoid
    expect(ilsToAgorot('0.10') + ilsToAgorot('0.20')).toBe(ilsToAgorot('0.30'))
    expect(ilsToAgorot('0.07') * 3).toBe(21)

    // 1.005 is stored as 1.00499999999999989, so `(1.005).toFixed(2)` is
    // "1.00" and a cent vanishes. Passing the number through toFixed first is
    // therefore lossy; passing the STRING is refused outright, which is the
    // behaviour that keeps the loss from being silent.
    expect((1.005).toFixed(2)).toBe('1.00')
    expect(() => ilsToAgorot('1.005')).toThrow(TypeError)
  })

  it('refuses every shape that is not a two-decimal amount', () => {
    // The real boundary. Each of these is a way a price reaches the money path
    // from somewhere it should not have: an exponent from JSON, a comma from a
    // Hebrew locale input, a third decimal from a percentage calculation.
    for (const bad of ['1e2', '1,50', '.5', '5.', '', ' ', 'NaN', 'Infinity', '0x10', '1.2.3']) {
      expect(() => ilsToAgorot(bad), `should reject ${JSON.stringify(bad)}`).toThrow(TypeError)
    }
  })

  it('stays exact at a scale where a float has already lost the agora', () => {
    // 2^53 agorot is about 90 trillion shekels, so this is far outside any real
    // order. The point is the boundary: the guard is a safe-integer assert, and
    // a value just inside it must survive the round trip byte for byte rather
    // than being silently rounded.
    const big = '90071992547.40'
    expect(agorotToIls(ilsToAgorot(big))).toBe(Number(big))
    expect(ilsToAgorot(big)).toBe(9_007_199_254_740)
  })

  it('rejects a third decimal rather than rounding it away', () => {
    // The dangerous direction. Accepting 1.005 and rounding it would mean a
    // price the customer was never quoted, decided by a rounding rule nobody
    // chose. It throws instead, at the boundary, where the caller still has
    // the original string.
    for (const bad of ['1.005', '0.001', '10.999', '5.1234']) {
      expect(() => ilsToAgorot(bad), bad).toThrow(TypeError)
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
