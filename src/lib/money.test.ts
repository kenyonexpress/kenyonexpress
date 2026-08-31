import { describe, expect, it } from 'vitest'
import { type Agorot, agorot } from './commerce/money'
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
    expect(net).toBe(847) // round(1000 * 10000 / 11800)
    expect(vat).toBe(153) // 1000 - 847
    expect(net + vat).toBe(gross)
  })

  it('splits the physical-line commission example', () => {
    // Physical F=10000, comm=1000 -> net 847, vat 153 (doc §2.2 balance).
    //
    // The doc's worked example was written at 17% and reads 855/145. The rate
    // is 18% since 2025-01-01 and VAT_RATE_BP now says so; the INVARIANT the
    // example exists to demonstrate is `net + vat === gross`, which is checked
    // above and is rate-independent, so only the two numerals move.
    const { net, vat } = extractVat(agorot(1000))
    expect(net).toBe(847)
    expect(vat).toBe(153)
  })

  it('is loss-free across a sweep of amounts', () => {
    for (let g = 0; g <= 5000; g++) {
      const { net, vat, gross } = extractVat(agorot(g))
      expect(net + vat).toBe(gross)
      expect(net).toBeGreaterThanOrEqual(0)
      expect(vat).toBeGreaterThanOrEqual(0)
    }
  })

  it('uses the 18% default rate, the one in force since 2025-01-01', () => {
    // Pinned deliberately. This asserted 1700 while the invoice module used 18,
    // and each file read correct on its own, which is how they stayed apart.
    expect(VAT_RATE_BP).toBe(1800)
    const { vatRateBp } = extractVat(agorot(100))
    expect(vatRateBp).toBe(1800)
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

/**
 * The guards below were the only uncovered code in this module: 89.83% lines,
 * 85% branches, measured 2026-08-20, and every uncovered line was a `throw`.
 *
 * That is the worst place for a coverage hole to sit. CLAUDE.md's hardest rule
 * is that no float ever touches the money path, and `assertSafeInteger` is the
 * runtime that enforces it. A guard with no test is an assumption, not a guard:
 * it can be weakened or deleted and every other test in this file still passes.
 */
describe('money-path guards (the no-float invariant at runtime)', () => {
  it('rejects a float amount rather than silently truncating it', () => {
    // 149.5 agorot is not a representable amount. The rule is that this
    // throws, not that it rounds - rounding here is how half-agorot drift
    // enters a ledger that is supposed to balance to zero.
    //
    // The cast is the point of the test, not a way around it. The `Agorot`
    // brand already rejects this at compile time (verified: tsc raises TS2345
    // without the cast), but a float parsed from JSON or read off a DB row is
    // branded by assertion, not by proof. The runtime guard is what covers
    // that path, so the test has to enter through it.
    expect(() => applyBp(149.5 as Agorot, 1000)).toThrow(RangeError)
    expect(() => divRoundHalfUp(10.5, 2)).toThrow(RangeError)
  })

  it('names the offending value in the error, so a failure is debuggable', () => {
    expect(() => divRoundHalfUp(10.5, 2)).toThrow(/safe integer.*10\.5/)
  })

  it('rejects amounts past Number.MAX_SAFE_INTEGER', () => {
    expect(() => divRoundHalfUp(Number.MAX_SAFE_INTEGER + 2, 2)).toThrow(RangeError)
    expect(() => applyBp(agorot(Number.MAX_SAFE_INTEGER), BP_WHOLE)).toThrow(RangeError)
  })

  it('rejects a non-finite percent instead of producing NaN basis points', () => {
    // NaN would flow through `bp()` and land in order_items as a snapshot
    // nobody can reconcile, so this has to fail loudly at the boundary.
    expect(() => percentToBp(Number.NaN)).toThrow(TypeError)
    expect(() => percentToBp(Number.POSITIVE_INFINITY)).toThrow(TypeError)
    expect(() => percentToBp('not a number')).toThrow(TypeError)
  })

  it('rejects a VAT rate outside 0..10000 bp', () => {
    expect(() => extractVat(agorot(10_000), -1)).toThrow(RangeError)
    expect(() => extractVat(agorot(10_000), BP_WHOLE + 1)).toThrow(RangeError)
    // The boundaries themselves are legal: 0% and 100% are both valid rates.
    expect(extractVat(agorot(10_000), 0).vat).toBe(0)
    expect(extractVat(agorot(10_000), BP_WHOLE).net).toBe(5_000)
  })

  it('rejects a fractional VAT rate', () => {
    expect(() => extractVat(agorot(10_000), VAT_RATE_BP + 0.5)).toThrow(RangeError)
  })
})
