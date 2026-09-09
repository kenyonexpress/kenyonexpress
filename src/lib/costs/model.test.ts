import { describe, expect, it } from 'vitest'
import {
  type CostLine,
  MEANINGFUL_ORDER_FLOOR,
  checkBudget,
  formatMicro,
  perOrder,
  projectMonth,
  toMicro,
  trendPoints,
} from './model'

/**
 * The two ways a cost dashboard lies, both asserted here rather than described.
 */

const USD = (amountMicro: number, kind: 'fixed' | 'variable', provider = 'p'): CostLine => ({
  provider,
  amountMicro,
  currency: 'USD',
  kind,
  source: 'manual',
})

describe('projecting the month', () => {
  it('does NOT extrapolate a subscription', () => {
    // THE TRAP. $20 of Vercel charged whole on day 1, seen on day 3: a linear
    // projection says $200 and the month will cost $20. An alert that fires on
    // that number is an alert nobody reads by the second month.
    const projection = projectMonth([USD(20_000_000, 'fixed')], {
      dayOfMonth: 3,
      daysInMonth: 30,
      currency: 'USD',
    })
    expect(projection.projectedMicro).toBe(20_000_000)
  })

  it('extrapolates only what accrues', () => {
    // $3 of usage over 3 days is $30 over 30.
    const projection = projectMonth([USD(3_000_000, 'variable')], {
      dayOfMonth: 3,
      daysInMonth: 30,
      currency: 'USD',
    })
    expect(projection.projectedMicro).toBe(30_000_000)
  })

  it('adds a whole subscription to an extrapolated usage', () => {
    const projection = projectMonth([USD(20_000_000, 'fixed'), USD(3_000_000, 'variable')], {
      dayOfMonth: 3,
      daysInMonth: 30,
      currency: 'USD',
    })
    expect(projection).toMatchObject({
      fixedMicro: 20_000_000,
      variableMicro: 3_000_000,
      spentMicro: 23_000_000,
      projectedMicro: 50_000_000,
    })
  })

  it('uses the real length of the month rather than assuming 30', () => {
    const february = projectMonth([USD(2_800_000, 'variable')], {
      dayOfMonth: 28,
      daysInMonth: 28,
      currency: 'USD',
    })
    expect(february.projectedMicro).toBe(2_800_000)
  })

  it('does not divide by zero on the first day', () => {
    const projection = projectMonth([USD(1_000_000, 'variable')], {
      dayOfMonth: 0,
      daysInMonth: 31,
      currency: 'USD',
    })
    expect(projection.projectedMicro).toBe(31_000_000)
  })

  it('drops a foreign currency rather than inventing a rate, and says so', () => {
    // A converted total looks authoritative and is wrong by whatever the rate
    // has moved since. The omission is reported instead.
    const projection = projectMonth(
      [USD(10_000_000, 'fixed'), { ...USD(50_000_000, 'fixed'), currency: 'ILS' }],
      { dayOfMonth: 15, daysInMonth: 30, currency: 'USD' },
    )
    expect(projection.spentMicro).toBe(10_000_000)
    expect(projection.mixedCurrency).toBe(true)
  })

  it('is quiet about currency when there is nothing to drop', () => {
    const projection = projectMonth([USD(10_000_000, 'fixed')], {
      dayOfMonth: 15,
      daysInMonth: 30,
      currency: 'USD',
    })
    expect(projection.mixedCurrency).toBe(false)
  })
})

describe('the budget threshold', () => {
  it('fires on the PROJECTION, not on what is already spent', () => {
    // An alert that waits for the money to be gone is a receipt.
    const verdict = checkBudget(120_000_000, 100_000_000)
    expect(verdict).toMatchObject({ breached: true, overMicro: 20_000_000, percentOfBudget: 120 })
  })

  it('does not fire under the ceiling', () => {
    expect(checkBudget(90_000_000, 100_000_000).breached).toBe(false)
  })

  it('does not fire exactly at the ceiling', () => {
    expect(checkBudget(100_000_000, 100_000_000).breached).toBe(false)
  })

  it('never fires against a budget nobody set', () => {
    // Alerting against a ceiling of zero is how a dashboard teaches its reader
    // to dismiss it.
    expect(checkBudget(999_000_000, 0).breached).toBe(false)
    expect(checkBudget(999_000_000, -5).breached).toBe(false)
  })
})

describe('cost per order', () => {
  const projection = projectMonth([USD(30_000_000, 'fixed'), USD(2_000_000, 'variable')], {
    dayOfMonth: 30,
    daysInMonth: 30,
    currency: 'USD',
  })

  it('refuses to call a subscription divided by four a cost per order', () => {
    // Production had FOUR orders when this was written. $32 / 4 = $8.00 looks
    // authoritative and moves by 25% with one more sale.
    const economics = perOrder(projection, 4)
    expect(economics.totalPerOrderMicro).toBe(8_000_000)
    expect(economics.isMeaningful).toBe(false)
  })

  it('separates what one more order costs from what the shop costs', () => {
    // The marginal figure is the only one that describes an order, and it is
    // useful at any volume.
    const economics = perOrder(projection, 4)
    expect(economics.marginalPerOrderMicro).toBe(500_000)
    expect(economics.totalPerOrderMicro).toBeGreaterThan(economics.marginalPerOrderMicro * 10)
  })

  it('becomes meaningful at the stated floor and not before', () => {
    expect(perOrder(projection, MEANINGFUL_ORDER_FLOOR - 1).isMeaningful).toBe(false)
    expect(perOrder(projection, MEANINGFUL_ORDER_FLOOR).isMeaningful).toBe(true)
  })

  it('divides by nothing when there are no orders', () => {
    const economics = perOrder(projection, 0)
    expect(economics).toMatchObject({ orders: 0, totalPerOrderMicro: 0, isMeaningful: false })
  })
})

describe('display', () => {
  it('shows two decimals, whatever precision was kept for summing', () => {
    expect(formatMicro(7_500, 'USD')).toBe('$0.01')
    expect(formatMicro(20_000_000, 'USD')).toBe('$20.00')
    expect(formatMicro(1_234_560_000, 'ILS')).toBe('₪1,234.56')
  })

  it('names an unknown currency rather than guessing a symbol', () => {
    expect(formatMicro(1_000_000, 'EUR')).toBe('EUR 1.00')
  })
})

describe('trendPoints', () => {
  const END = new Date(Date.UTC(2026, 8, 1)) // 2026-09

  it('returns one point per month, oldest first', () => {
    const points = trendPoints([], END, 12)
    expect(points).toHaveLength(12)
    expect(points[0]?.label).toBe('2025-10')
    expect(points[11]?.label).toBe('2026-09')
  })

  it('draws a month nobody recorded as zero rather than skipping it', () => {
    // The gap IS the information. A trend that omits the empty months draws a
    // smooth line across a hole and invites the reader to believe spending was
    // continuous -- and the axis then lies about spacing too, because the
    // points either side of the hole end up adjacent.
    const points = trendPoints(
      [{ month: '2026-09-01', fixedMicro: 20_000_000, variableMicro: 0, orders: 4 }],
      END,
      3,
    )
    expect(points.map((point) => point.label)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(points[0]?.totalMicro).toBe(0)
    expect(points[2]?.totalMicro).toBe(20_000_000)
  })

  it('has no cost per order in a month with no orders', () => {
    // Null and not zero: the bill was paid and nothing was sold, and a zero
    // would draw a line to the floor reading "orders were free that month".
    const points = trendPoints(
      [{ month: '2026-09-01', fixedMicro: 20_000_000, variableMicro: 0, orders: 0 }],
      END,
      1,
    )
    expect(points[0]?.perOrderMicro).toBeNull()
  })

  it('divides the whole bill by the orders, fixed included', () => {
    const points = trendPoints(
      [{ month: '2026-09-01', fixedMicro: 20_000_000, variableMicro: 4_000_000, orders: 8 }],
      END,
      1,
    )
    expect(points[0]?.totalMicro).toBe(24_000_000)
    expect(points[0]?.perOrderMicro).toBe(3_000_000)
  })

  it('crosses a year boundary without inventing a month', () => {
    const points = trendPoints([], new Date(Date.UTC(2027, 0, 1)), 3)
    expect(points.map((point) => point.label)).toEqual(['2026-11', '2026-12', '2027-01'])
  })
})

describe('toMicro', () => {
  /**
   * It was exported from `server/actions/admin/costs.ts` with the comment
   * "Exported for its test", and NOTHING imported it -- there was no test. The
   * export was therefore doing only one thing: publishing a money parser as a
   * server-action endpoint, which is what broke the production build.
   */
  it('converts without floating point', () => {
    // The number the doc comment is about: parseFloat('20.10') * 1e6 is
    // 20099999.999999996.
    expect(toMicro('20.10')).toBe(20_100_000)
    expect(toMicro('0.000001')).toBe(1)
    expect(toMicro('1')).toBe(1_000_000)
    expect(toMicro('0')).toBe(0)
  })

  it('pads a short fraction rather than reading it as units', () => {
    // '.1' is a tenth, so 100000 micro. Reading the digits as micro directly
    // would make it 1.
    expect(toMicro('0.1')).toBe(100_000)
    expect(toMicro('0.01')).toBe(10_000)
  })

  it('trims, because a trailing space in a typed amount is invisible', () => {
    expect(toMicro('  12.50  ')).toBe(12_500_000)
  })

  it.each(['', '-1', '1.2345678', 'abc', '1e6', '1,000', '.5', '1.'])(
    'refuses %s rather than guessing',
    (input) => {
      expect(toMicro(input)).toBeNull()
    },
  )

  it('refuses a value too large to stay an exact integer', () => {
    expect(toMicro('99999999999')).toBeNull()
  })
})
