import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  REVENUE_FACT_EVENT,
  REVENUE_FACT_FIELDS,
  type RevenueFactInput,
  buildRevenueFact,
} from './revenue-fact'

const purchase: RevenueFactInput = {
  kind: 'purchase',
  orderId: 'o2',
  amountAgorot: 12_345,
  occurredAt: '2026-09-15T10:00:00Z',
  firstOrder: { orderId: 'o1', paidAt: '2026-06-30T22:30:00Z' },
  cashbackTier: 'silver',
  checkoutVariant: 'express_summary',
  productTypes: ['physical', 'coupon', 'physical'],
  utm: { utm_source: 'google', utm_campaign: 'summer' },
  customerKey: 'abcd1234',
}

describe('buildRevenueFact', () => {
  it('shapes a repeat purchase with its cohort and month offset in Israel time', () => {
    const fact = buildRevenueFact(purchase)
    expect(fact).toEqual({
      event: 'revenue.purchase',
      kind: 'purchase',
      order_id: 'o2',
      amount_agorot: 12_345,
      signed_amount_agorot: 12_345,
      // 22:30 UTC on 30 June is 1 July in Jerusalem.
      cohort_month: '2026-07',
      event_month: '2026-09',
      months_since_first_order: 2,
      is_first_order: false,
      cashback_tier: 'silver',
      checkout_variant: 'express_summary',
      product_types: 'coupon,physical',
      utm_source: 'google',
      utm_medium: null,
      utm_campaign: 'summer',
      customer_key: 'abcd1234',
    })
  })

  it('flags the first order by id, not by month', () => {
    const fact = buildRevenueFact({
      ...purchase,
      orderId: 'o1',
      occurredAt: '2026-07-20T10:00:00Z',
    })
    expect(fact.is_first_order).toBe(true)
    expect(fact.months_since_first_order).toBe(0)

    const sameMonthRepeat = buildRevenueFact({ ...purchase, occurredAt: '2026-07-20T10:00:00Z' })
    expect(sameMonthRepeat.is_first_order).toBe(false)
    expect(sameMonthRepeat.months_since_first_order).toBe(0)
  })

  it('signs a refund negative and never marks it first', () => {
    const fact = buildRevenueFact({ ...purchase, kind: 'refund', orderId: 'o1' })
    expect(fact.event).toBe('revenue.refund')
    expect(fact.amount_agorot).toBe(12_345)
    expect(fact.signed_amount_agorot).toBe(-12_345)
    expect(fact.is_first_order).toBe(false)
  })

  it('degrades to nulls when the cohort is unknown', () => {
    const fact = buildRevenueFact({
      kind: 'purchase',
      orderId: 'o9',
      amountAgorot: 0,
      occurredAt: '2026-09-15T10:00:00Z',
      firstOrder: null,
    })
    expect(fact.cohort_month).toBeNull()
    expect(fact.months_since_first_order).toBeNull()
    expect(fact.is_first_order).toBe(false)
    expect(fact.product_types).toBeNull()
    expect(fact.customer_key).toBeNull()
  })

  it('refuses a float or negative amount', () => {
    expect(() => buildRevenueFact({ ...purchase, amountAgorot: 12.5 })).toThrow(TypeError)
    expect(() => buildRevenueFact({ ...purchase, amountAgorot: -1 })).toThrow(TypeError)
  })

  it('emits exactly the declared field list', () => {
    expect(Object.keys(buildRevenueFact(purchase)).sort()).toEqual([...REVENUE_FACT_FIELDS].sort())
  })
})

/**
 * The dashboard is APL strings and nothing ties an identifier in them to the
 * fact that carries it. A field renamed here would leave every chart empty
 * with no error, so each identifier a query names must be a declared field,
 * an alias the query itself introduces, or Axiom's `_time`.
 */
describe('scripts/axiom/dashboards/revenue.json queries only fields the fact carries', () => {
  const dashboard = JSON.parse(
    readFileSync(resolve(process.cwd(), 'scripts/axiom/dashboards/revenue.json'), 'utf8'),
  ) as {
    datasets: string[]
    charts: { id: string; query: { apl: string } }[]
    layout: { i: string }[]
  }

  const APL_KEYWORDS = new Set([
    'where',
    'and',
    'or',
    'not',
    'summarize',
    'by',
    'sort',
    'asc',
    'desc',
    'limit',
    'startswith',
    'true',
    'false',
    'sum',
    'count',
    'countif',
    'dcount',
    'bin_auto',
    'isnotnull',
    '_time',
  ])

  it('targets the revenue dataset placeholder', () => {
    expect(dashboard.datasets).toEqual(['{{revenue_dataset}}'])
  })

  it('names only declared fields', () => {
    const declared = new Set<string>(REVENUE_FACT_FIELDS)
    for (const chart of dashboard.charts) {
      const apl = chart.query.apl.replaceAll("['{{revenue_dataset}}']", '').replace(/'[^']*'/g, '')
      // Aliases are `name =`; they are introduced by the query, not read from the fact.
      const aliases = new Set([...apl.matchAll(/\b([a-z_]+)\s*=(?!=)/g)].map((m) => m[1]))
      const identifiers = [...apl.matchAll(/\b([a-z_][a-z0-9_]*)\b/g)].map((m) => m[1] ?? '')
      const unknown = identifiers.filter(
        (id) => !declared.has(id) && !APL_KEYWORDS.has(id) && !aliases.has(id),
      )
      expect(unknown, `chart ${chart.id}: ${unknown.join(', ')}`).toEqual([])
    }
  })

  it('references only the event names the fact emits', () => {
    const emitted = new Set(Object.values(REVENUE_FACT_EVENT))
    for (const chart of dashboard.charts) {
      for (const [, name] of chart.query.apl.matchAll(/event == '([^']+)'/g)) {
        expect(emitted.has(name ?? ''), `chart ${chart.id} queries ${name}`).toBe(true)
      }
    }
  })

  it('lays out every chart exactly once', () => {
    expect(dashboard.layout.map((cell) => cell.i).sort()).toEqual(
      dashboard.charts.map((chart) => chart.id).sort(),
    )
  })
})
