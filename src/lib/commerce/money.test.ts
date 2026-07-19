import { describe, expect, it } from 'vitest'
import { agorot, formatIls, ilsToAgorot, percentToBasisPoints, percentageOf } from './money'

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
})
