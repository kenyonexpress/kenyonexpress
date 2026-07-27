import { agorot, sumAgorot } from '@/lib/commerce/money'
import { describe, expect, it } from 'vitest'
import { buildVoucherHolds, splitCommissionPerUnit } from './escrow'

const a = (n: number) => agorot(n)

describe('splitCommissionPerUnit', () => {
  it('gives a single unit the whole commission', () => {
    expect(splitCommissionPerUnit([a(5000)], a(1500))).toEqual([1500])
  })

  it('sums back to the line commission exactly', () => {
    const held = [a(3334), a(3333), a(3333)]
    const shares = splitCommissionPerUnit(held, a(2500))
    expect(sumAgorot(shares)).toBe(2500)
  })

  it('never hands a unit more commission than it was charged', () => {
    // The case the first-unit-absorbs-the-remainder split gets wrong: ten units
    // of 100 with a 995 commission would give unit 1 a commission of 104.
    const held = Array.from({ length: 10 }, () => a(100))
    const shares = splitCommissionPerUnit(held, a(995))
    expect(sumAgorot(shares)).toBe(995)
    for (const [index, share] of shares.entries()) {
      expect(share).toBeLessThanOrEqual(held[index] as number)
    }
  })

  it('distributes proportionally to what each unit was charged', () => {
    const shares = splitCommissionPerUnit([a(1000), a(3000)], a(400))
    expect(shares).toEqual([100, 300])
  })

  it('handles a zero commission', () => {
    expect(splitCommissionPerUnit([a(100), a(100)], a(0))).toEqual([0, 0])
  })

  it('handles a commission equal to the whole prepayment', () => {
    const held = [a(700), a(300)]
    expect(splitCommissionPerUnit(held, a(1000))).toEqual([700, 300])
  })

  it('returns zeros when nothing was charged', () => {
    expect(splitCommissionPerUnit([a(0), a(0)], a(0))).toEqual([0, 0])
  })

  it('refuses a commission larger than the amount held', () => {
    expect(() => splitCommissionPerUnit([a(100)], a(101))).toThrow(RangeError)
  })

  it('refuses a negative commission', () => {
    expect(() => splitCommissionPerUnit([a(100)], a(-1))).toThrow(RangeError)
  })

  it('refuses an empty unit list', () => {
    expect(() => splitCommissionPerUnit([], a(0))).toThrow(RangeError)
  })
})

describe('buildVoucherHolds', () => {
  it('conserves held = commission + release on every row', () => {
    const held = [a(3334), a(3333), a(3333)]
    const holds = buildVoucherHolds(held, a(2501))
    for (const hold of holds) {
      expect(hold.held).toBe(hold.commission + hold.release)
      expect(hold.release).toBeGreaterThanOrEqual(0)
    }
  })

  it('conserves the line totals across the rows', () => {
    const held = [a(5000), a(5000), a(5001)]
    const holds = buildVoucherHolds(held, a(4500))
    expect(sumAgorot(holds.map((h) => h.held))).toBe(15001)
    expect(sumAgorot(holds.map((h) => h.commission))).toBe(4500)
    expect(sumAgorot(holds.map((h) => h.release))).toBe(15001 - 4500)
  })

  it('leaves the supplier nothing when the platform takes 100 percent', () => {
    const holds = buildVoucherHolds([a(2000), a(2000)], a(4000))
    expect(holds.map((h) => h.release)).toEqual([0, 0])
  })

  it('leaves the supplier everything when the platform takes nothing', () => {
    const holds = buildVoucherHolds([a(2000), a(2000)], a(0))
    expect(holds.map((h) => h.release)).toEqual([2000, 2000])
  })
})
