import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { affiliateCommission, platformShareOfLine } from './commission'

describe('affiliate commission', () => {
  it('takes the commission from the platform share, not the order total', () => {
    const share = platformShareOfLine(agorot(10_000), 1500) // 15% of 100 ILS
    expect(share).toBe(1500)
    expect(affiliateCommission(share, 2000)).toBe(300) // 20% of 15 ILS
  })
  it('rounds half up in integer agorot, like the SQL function', () => {
    expect(affiliateCommission(agorot(5), 1000)).toBe(1) // 0.5 -> 1
    expect(affiliateCommission(agorot(4), 1000)).toBe(0)
  })
  it('rejects out-of-range rates', () => {
    expect(() => affiliateCommission(agorot(100), 10_001)).toThrow()
    expect(() => affiliateCommission(agorot(100), -1)).toThrow()
  })
})
