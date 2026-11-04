import { calculateCommission } from '@/lib/commerce/commission'
import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CASHBACK_PERCENT, cashbackEnabledFor, effectiveCashbackPercent } from './product'

describe('effectiveCashbackPercent: the rate a product pays', () => {
  it('defaults to zero: a product with no rate earns nothing', () => {
    expect(DEFAULT_CASHBACK_PERCENT).toBe(0)
    expect(effectiveCashbackPercent({})).toBe(0)
    expect(effectiveCashbackPercent({ cashback_percent: null })).toBe(0)
    expect(effectiveCashbackPercent({ cashback_percent: '' })).toBe(0)
    expect(effectiveCashbackPercent({ cashback_percent: 0 })).toBe(0)
    expect(effectiveCashbackPercent({ cashback_percent: '0.00' })).toBe(0)
  })

  // The defect measured on 04.11.2026: three ACTIVE products with the switch
  // off and the rate at 5 paid 5% on every purchase.
  it('pays nothing when the switch is off, whatever the rate says', () => {
    expect(effectiveCashbackPercent({ cashback_enabled: false, cashback_percent: '5.00' })).toBe(0)
    expect(effectiveCashbackPercent({ cashback_enabled: false, cashback_percent: 50 })).toBe(0)
  })

  it('pays the rate when the switch is on', () => {
    expect(effectiveCashbackPercent({ cashback_enabled: true, cashback_percent: '5.00' })).toBe(5)
    expect(effectiveCashbackPercent({ cashback_enabled: true, cashback_percent: 2.5 })).toBe(2.5)
  })

  // Absent means "not selected", not "off": fixtures and the pre-048 cart probe.
  it('reads an unselected switch as on, so the rate still decides', () => {
    expect(effectiveCashbackPercent({ cashback_percent: 3 })).toBe(3)
    expect(effectiveCashbackPercent({ cashback_enabled: null, cashback_percent: 3 })).toBe(3)
  })

  it('treats junk and negatives as zero and caps at 100', () => {
    expect(effectiveCashbackPercent({ cashback_percent: 'abc' })).toBe(0)
    expect(effectiveCashbackPercent({ cashback_percent: -4 })).toBe(0)
    expect(effectiveCashbackPercent({ cashback_percent: Number.NaN })).toBe(0)
    expect(effectiveCashbackPercent({ cashback_percent: 150 })).toBe(100)
  })
})

describe('cashbackEnabledFor: the switch the admin save writes', () => {
  it('is on exactly when the rate pays something', () => {
    expect(cashbackEnabledFor(5)).toBe(true)
    expect(cashbackEnabledFor(0.5)).toBe(true)
    expect(cashbackEnabledFor(0)).toBe(false)
    expect(cashbackEnabledFor(null)).toBe(false)
    expect(cashbackEnabledFor(undefined)).toBe(false)
  })
})

describe('the effective rate reaches the order line in integer agorot', () => {
  const line = (cashbackPercent: number) =>
    calculateCommission({
      idempotencyKey: 's23-cashback',
      lines: [
        {
          id: 'p1::null',
          productType: 'physical',
          unitPrice: agorot(10_000),
          quantity: 3,
          platformPercent: 10,
          cashbackPercent,
        },
      ],
    }).lines[0] as { cashbackAmount: number }

  it('a disabled 5% product snapshots zero cashback', () => {
    const percent = effectiveCashbackPercent({ cashback_enabled: false, cashback_percent: '5.00' })
    expect(line(percent).cashbackAmount).toBe(0)
  })

  it('an enabled 5% product snapshots 5% of what the buyer pays now', () => {
    const percent = effectiveCashbackPercent({ cashback_enabled: true, cashback_percent: '5.00' })
    const result = line(percent)
    expect(result.cashbackAmount).toBe(1_500)
    expect(Number.isInteger(result.cashbackAmount)).toBe(true)
  })
})
