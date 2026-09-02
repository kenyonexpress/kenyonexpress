import { buildRecurringOffer, describeRecurringPrice } from '@/lib/commerce/recurring'
import { describe, expect, it } from 'vitest'

describe('what a product may be sold as', () => {
  it('builds the offer from complete billing columns', () => {
    expect(
      buildRecurringOffer({
        recurring_amount_agorot: 4_900,
        billing_interval: 'monthly',
        billing_interval_count: 1,
      }),
    ).toEqual({ amountAgorot: 4_900, interval: 'monthly', intervalCount: 1 })
  })

  // "₪0 לחודש" is an offer nobody made. Anything incomplete is null and the
  // PDP falls back to the ordinary price block.
  it('refuses an incomplete or absurd configuration', () => {
    for (const broken of [
      { recurring_amount_agorot: null, billing_interval: 'monthly' },
      { recurring_amount_agorot: 0, billing_interval: 'monthly' },
      { recurring_amount_agorot: -100, billing_interval: 'monthly' },
      { recurring_amount_agorot: 49.9, billing_interval: 'monthly' },
      { recurring_amount_agorot: 4900, billing_interval: 'weekly' },
      { recurring_amount_agorot: 4900, billing_interval: null },
    ]) {
      expect(buildRecurringOffer(broken), JSON.stringify(broken)).toBeNull()
    }
  })

  it('defaults a missing interval count to one', () => {
    expect(
      buildRecurringOffer({ recurring_amount_agorot: 100, billing_interval: 'yearly' })
        ?.intervalCount,
    ).toBe(1)
  })
})

describe('the one-line price', () => {
  it('speaks whole shekels without decimals and agorot with them', () => {
    expect(
      describeRecurringPrice({ amountAgorot: 4_900, interval: 'monthly', intervalCount: 1 }),
    ).toBe('₪49 לחודש')
    expect(
      describeRecurringPrice({ amountAgorot: 4_990, interval: 'monthly', intervalCount: 1 }),
    ).toBe('₪49.90 לחודש')
  })

  it('names the multi-cycle interval', () => {
    expect(
      describeRecurringPrice({ amountAgorot: 10_000, interval: 'monthly', intervalCount: 3 }),
    ).toBe('₪100 לכל 3 חודשים')
    expect(
      describeRecurringPrice({ amountAgorot: 50_000, interval: 'yearly', intervalCount: 1 }),
    ).toBe('₪500 לשנה')
  })
})
