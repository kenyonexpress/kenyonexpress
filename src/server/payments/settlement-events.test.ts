import { describe, expect, it } from 'vitest'
import { type SettledLine, buildChargeSettledEvents } from './settlement-events'

const AT = new Date('2026-07-29T10:00:00.000Z')

const line = (over: Partial<SettledLine> = {}): SettledLine => ({
  id: 'item-1',
  supplier_id: 'sup-1',
  paid_on_site_agorot: 4000,
  commission_agorot: 1200,
  supplier_immediate_agorot: 2800,
  platform_percent: 30,
  ...over,
})

describe('buildChargeSettledEvents', () => {
  it('writes one event per line, carrying the split it was computed under', () => {
    const [event] = buildChargeSettledEvents('order-1', [line()], AT)
    expect(event).toMatchObject({
      order_id: 'order-1',
      order_item_id: 'item-1',
      supplier_id: 'sup-1',
      kind: 'charge_settled',
      paid_on_site_agorot: 4000,
      commission_agorot: 1200,
      supplier_due_agorot: 2800,
      platform_percent_snapshot: 30,
      supplier_split_percent_snapshot: 70,
    })
  })

  it('derives the supplier half so 094 CHECK is satisfiable by construction', () => {
    // The line stores one half; the table requires the pair to sum to 100.
    for (const percent of [0, 5, 33.33, 100]) {
      const [event] = buildChargeSettledEvents('o', [line({ platform_percent: percent })], AT)
      expect(
        (event?.platform_percent_snapshot ?? 0) + (event?.supplier_split_percent_snapshot ?? 0),
      ).toBeCloseTo(100, 5)
    }
  })

  it('leaves both halves null rather than inventing a split', () => {
    const [event] = buildChargeSettledEvents('o', [line({ platform_percent: null })], AT)
    expect(event?.platform_percent_snapshot).toBeNull()
    expect(event?.supplier_split_percent_snapshot).toBeNull()
  })

  it('refuses an out-of-range percent instead of writing one 094 would reject', () => {
    for (const percent of [-1, 101, Number.NaN]) {
      const [event] = buildChargeSettledEvents('o', [line({ platform_percent: percent })], AT)
      expect(event?.platform_percent_snapshot).toBeNull()
    }
  })

  it('coerces numeric strings, which is how Postgres returns bigint', () => {
    const [event] = buildChargeSettledEvents(
      'o',
      [line({ paid_on_site_agorot: '4000', commission_agorot: '1200' })],
      AT,
    )
    expect(event?.paid_on_site_agorot).toBe(4000)
    expect(event?.commission_agorot).toBe(1200)
  })

  it('keeps every amount an integer number of agorot', () => {
    const [event] = buildChargeSettledEvents('o', [line({ paid_on_site_agorot: 4000.6 })], AT)
    expect(Number.isInteger(event?.paid_on_site_agorot)).toBe(true)
  })

  it('treats a missing amount as zero rather than as null', () => {
    const [event] = buildChargeSettledEvents(
      'o',
      [line({ supplier_immediate_agorot: null, commission_agorot: null })],
      AT,
    )
    expect(event?.supplier_due_agorot).toBe(0)
    expect(event?.commission_agorot).toBe(0)
  })

  it('keys idempotency per line, so a replayed finalize adds nothing', () => {
    // finalizeOrder is deliberately replay-safe: the webhook can deliver twice
    // and the return page reconciles the same order. Two runs must produce the
    // same keys, and 094's unique constraint turns the second into a no-op.
    const first = buildChargeSettledEvents('o', [line(), line({ id: 'item-2' })], AT)
    const second = buildChargeSettledEvents('o', [line(), line({ id: 'item-2' })], new Date())
    expect(first.map((e) => e.idempotency_key)).toEqual([
      'charge_settled:item-1',
      'charge_settled:item-2',
    ])
    expect(second.map((e) => e.idempotency_key)).toEqual(first.map((e) => e.idempotency_key))
  })

  it('records the payment and terminal it settled on', () => {
    const [event] = buildChargeSettledEvents('o', [line()], AT, {
      paymentId: 'pay-1',
      cardcomAccountId: 'anchor',
    })
    expect(event?.metadata).toEqual({ payment_id: 'pay-1', cardcom_account_id: 'anchor' })
  })

  it('returns nothing for an order with no lines', () => {
    expect(buildChargeSettledEvents('o', [], AT)).toEqual([])
  })
})
