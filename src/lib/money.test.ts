import { describe, expect, it } from 'vitest'
import { agorot } from './commerce/money'
import {
  BP_WHOLE,
  VAT_RATE_BP,
  applyBp,
  bp,
  divRoundHalfUp,
  extractVat,
  parseIls,
  percentToBp,
} from './money'

describe('divRoundHalfUp', () => {
  it('rounds halves away from zero', () => {
    expect(divRoundHalfUp(5, 2)).toBe(3) // 2.5 -> 3
    expect(divRoundHalfUp(7, 2)).toBe(4) // 3.5 -> 4
    expect(divRoundHalfUp(1, 2)).toBe(1) // 0.5 -> 1
    expect(divRoundHalfUp(-5, 2)).toBe(-3) // symmetric
    expect(divRoundHalfUp(-1, 2)).toBe(-1)
  })

  it('rounds sub-half down and super-half up', () => {
    expect(divRoundHalfUp(4, 3)).toBe(1) // 1.33 -> 1
    expect(divRoundHalfUp(5, 3)).toBe(2) // 1.66 -> 2
  })

  it('is exact for whole divisions', () => {
    expect(divRoundHalfUp(10_000, 10_000)).toBe(1)
    expect(divRoundHalfUp(0, 7)).toBe(0)
  })

  it('rejects a non-positive denominator', () => {
    expect(() => divRoundHalfUp(1, 0)).toThrow()
    expect(() => divRoundHalfUp(1, -3)).toThrow()
  })
})

describe('bp / percentToBp', () => {
  it('accepts 0..10000', () => {
    expect(bp(0)).toBe(0)
    expect(bp(BP_WHOLE)).toBe(10_000)
  })

  it('rejects out-of-range basis points', () => {
    expect(() => bp(-1)).toThrow()
    expect(() => bp(10_001)).toThrow()
  })

  it('converts whole percent to basis points', () => {
    expect(percentToBp(10)).toBe(1000)
    expect(percentToBp('10')).toBe(1000)
    expect(percentToBp(100)).toBe(10_000)
    expect(percentToBp('33.33')).toBe(3333)
  })
})

describe('applyBp', () => {
  it('applies a rate with half-up rounding', () => {
    // 10000 agorot (₪100) at 10% = 1000 agorot
    expect(applyBp(agorot(10_000), 1000)).toBe(1000)
    // 999 agorot at 10% = 99.9 -> 100
    expect(applyBp(agorot(999), 1000)).toBe(100)
    // 995 agorot at 10% = 99.5 -> 100 (half-up)
    expect(applyBp(agorot(995), 1000)).toBe(100)
    // 994 agorot at 10% = 99.4 -> 99
    expect(applyBp(agorot(994), 1000)).toBe(99)
  })

  it('returns 0 for a 0 bp rate and the full amount for 10000 bp', () => {
    expect(applyBp(agorot(12_345), 0)).toBe(0)
    expect(applyBp(agorot(12_345), BP_WHOLE)).toBe(12_345)
  })

  it('rejects negative basis points', () => {
    expect(() => applyBp(agorot(100), -1)).toThrow()
  })
})

describe('extractVat', () => {
  it('splits a gross amount into net + vat that sum back exactly', () => {
    // Coupon on-site charge P = 1000 agorot (from the doc balance example).
    const { net, vat, gross } = extractVat(agorot(1000))
    expect(net).toBe(855) // round(1000 * 10000 / 11700)
    expect(vat).toBe(145) // 1000 - 855
    expect(net + vat).toBe(gross)
  })

  it('splits the physical-line commission example', () => {
    // Physical F=10000, comm=1000 -> net 855, vat 145 (doc §2.2 balance).
    const { net, vat } = extractVat(agorot(1000))
    expect(net).toBe(855)
    expect(vat).toBe(145)
  })

  it('is loss-free across a sweep of amounts', () => {
    for (let g = 0; g <= 5000; g++) {
      const { net, vat, gross } = extractVat(agorot(g))
      expect(net + vat).toBe(gross)
      expect(net).toBeGreaterThanOrEqual(0)
      expect(vat).toBeGreaterThanOrEqual(0)
    }
  })

  it('uses the 17% default rate', () => {
    expect(VAT_RATE_BP).toBe(1700)
    const { vatRateBp } = extractVat(agorot(100))
    expect(vatRateBp).toBe(1700)
  })
})

describe('ledger balance examples (COMPLETE-SYSTEM-ARCHITECTURE §2.2)', () => {
  it('coupon line: F=10000 bp=1000 balances to zero', () => {
    const face = agorot(10_000)
    const platformBp = 1000
    const wallet = 0
    const paidOnSite = applyBp(face, platformBp) // P = 1000
    expect(paidOnSite).toBe(1000)
    const { net, vat } = extractVat(paidOnSite)
    // D cardcom_clearing (P - W); D customer_wallet W; C platform_revenue net; C vat_output vat
    const debits = paidOnSite - wallet + wallet
    const credits = net + vat
    expect(debits - credits).toBe(0)
  })

  it('physical line: F=10000 comm=1000 balances to zero', () => {
    const face = agorot(10_000)
    const platformBp = 1000
    const wallet = 0
    const commission = applyBp(face, platformBp) // 1000
    const supplierDue = face - commission // 9000
    const { net, vat } = extractVat(commission) // 855 + 145
    // D cardcom_clearing (F - W); D customer_wallet W; C supplier_payable (F-comm); C platform_revenue net; C vat_output vat
    const debits = face - wallet + wallet
    const credits = supplierDue + net + vat
    expect(debits - credits).toBe(0)
    expect(supplierDue).toBe(9000)
  })
})

describe('parseIls', () => {
  it('parses shekel strings to agorot without float error', () => {
    expect(parseIls('149.00')).toBe(14_900)
    expect(parseIls('0.01')).toBe(1)
    expect(parseIls('1')).toBe(100)
  })

  it('rejects more than two fraction digits', () => {
    expect(() => parseIls('1.234')).toThrow()
  })
})
