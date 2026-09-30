import { describe, expect, it } from 'vitest'
import { cashbackPreview } from './preview'

describe('cashbackPreview', () => {
  it('earns the product rate on what is paid now, in integer agorot', () => {
    expect(cashbackPreview(5, 150)).toEqual({ percent: 5, unitAgorot: 750 })
    expect(cashbackPreview('2.5', 80)).toEqual({ percent: 2.5, unitAgorot: 200 })
  })

  it('rounds half-up once, like the settlement engine', () => {
    // 3.33% of ₪1.00 = 3.33 agorot -> 3; 3.33% of ₪1.50 = 4.995 -> 5
    expect(cashbackPreview(3.33, 1)?.unitAgorot).toBe(3)
    expect(cashbackPreview(3.33, 1.5)?.unitAgorot).toBe(5)
  })

  it('says nothing for a zero, absent or malformed rate', () => {
    expect(cashbackPreview(0, 150)).toBeNull()
    expect(cashbackPreview(null, 150)).toBeNull()
    expect(cashbackPreview(undefined, 150)).toBeNull()
    expect(cashbackPreview('abc', 150)).toBeNull()
    expect(cashbackPreview(-5, 150)).toBeNull()
  })

  it('says nothing for a price that cannot be charged', () => {
    expect(cashbackPreview(5, 0)).toBeNull()
    expect(cashbackPreview(5, null)).toBeNull()
    expect(cashbackPreview(5, Number.NaN)).toBeNull()
    expect(cashbackPreview(5, -10)).toBeNull()
  })

  it('says nothing when the reward would round to zero agorot', () => {
    expect(cashbackPreview(0.01, 0.01)).toBeNull()
  })
})
