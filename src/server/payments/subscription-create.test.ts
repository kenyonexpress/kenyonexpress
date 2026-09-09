import {
  type RecurringProductBilling,
  type SubscriptionAdmin,
  createSubscriptionsForOrder,
  planSubscriptions,
} from '@/server/payments/subscription-create'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const NOW = new Date('2026-09-02T10:00:00.000Z')

const product: RecurringProductBilling = {
  id: 'prod-1',
  recurring_amount_agorot: 4_900,
  billing_interval: 'monthly',
  billing_interval_count: 1,
}

const line = { productId: 'prod-1', supplierId: 'sup-1', platformPercent: 12 }

const base = {
  userId: 'user-1',
  paymentTokenId: 'tok-1',
  lines: [line],
  products: [product],
  now: NOW,
}

describe('planning: what a paid order may become', () => {
  it('plans one row per recurring line, on the worker contract', () => {
    const plan = planSubscriptions(base)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.rows).toEqual([
      {
        productId: 'prod-1',
        supplierId: 'sup-1',
        amountAgorot: 4_900,
        platformPercent: 12,
        billingInterval: 'monthly',
        billingIntervalCount: 1,
        nextChargeAtIso: '2026-10-02T10:00:00.000Z',
      },
    ])
  })

  it('an order with no recurring lines plans nothing and refuses nothing', () => {
    expect(planSubscriptions({ ...base, lines: [], products: [] })).toEqual({ ok: true, rows: [] })
  })

  // The customer has already been CHARGED by the time the plan runs, so each
  // refusal is surfaced as an alarm by the caller. These tests pin the reasons.
  it('refuses a guest: there is no user to bill next month', () => {
    expect(planSubscriptions({ ...base, userId: null })).toEqual({
      ok: false,
      reason: 'guest_has_no_subscription',
    })
  })

  it('refuses when the charge did not tokenise', () => {
    expect(planSubscriptions({ ...base, paymentTokenId: null })).toEqual({
      ok: false,
      reason: 'no_payment_token',
    })
  })

  it('refuses a product with no billing configuration, naming it', () => {
    for (const broken of [
      { ...product, recurring_amount_agorot: null },
      { ...product, recurring_amount_agorot: 0 },
      { ...product, recurring_amount_agorot: 49.5 },
      { ...product, billing_interval: 'weekly' },
      { ...product, billing_interval: null },
    ]) {
      expect(planSubscriptions({ ...base, products: [broken] })).toEqual({
        ok: false,
        reason: 'product_not_billable',
        productId: 'prod-1',
      })
    }
  })

  it('snapshots the LINE percent and never rereads the product', () => {
    const plan = planSubscriptions({ ...base, lines: [{ ...line, platformPercent: 7 }] })
    expect(plan.ok && plan.rows[0]?.platformPercent).toBe(7)
  })
})

function stubAdmin(existing: { product_id: string }[] = [], insertError: string | null = null) {
  const insert = vi.fn().mockResolvedValue({ error: insertError ? { message: insertError } : null })
  const eq = vi.fn().mockResolvedValue({ data: existing, error: null })
  const admin = {
    from: () => ({ select: () => ({ eq }), insert }),
  } as unknown as SubscriptionAdmin
  return { admin, insert }
}

const planned = {
  productId: 'prod-1',
  supplierId: 'sup-1',
  amountAgorot: 4_900,
  platformPercent: 12,
  billingInterval: 'monthly' as const,
  billingIntervalCount: 1,
  nextChargeAtIso: '2026-10-02T10:00:00.000Z',
}

describe('creation: idempotent on the order', () => {
  it('writes the row the renewal worker reads', async () => {
    const { admin, insert } = stubAdmin()
    const result = await createSubscriptionsForOrder(admin, {
      orderId: 'ord-1',
      userId: 'user-1',
      paymentTokenId: 'tok-1',
      rows: [planned],
      now: NOW,
    })
    expect(result).toEqual({ created: 1, error: null })
    expect(insert.mock.calls[0]?.[0]).toEqual([
      {
        user_id: 'user-1',
        product_id: 'prod-1',
        supplier_id: 'sup-1',
        origin_order_id: 'ord-1',
        payment_token_id: 'tok-1',
        status: 'active',
        amount_agorot: 4_900,
        platform_percent: 12,
        billing_interval: 'monthly',
        billing_interval_count: 1,
        next_charge_at: '2026-10-02T10:00:00.000Z',
        // the first cycle was the checkout charge itself
        last_charge_at: NOW.toISOString(),
        failed_attempts: 0,
      },
    ])
  })

  // finalize replays: the webhook retries and the DLQ replays. A replay must
  // not mint a second subscription for the same order.
  it('a replay inserts nothing', async () => {
    const { admin, insert } = stubAdmin([{ product_id: 'prod-1' }])
    const result = await createSubscriptionsForOrder(admin, {
      orderId: 'ord-1',
      userId: 'user-1',
      paymentTokenId: 'tok-1',
      rows: [planned],
      now: NOW,
    })
    expect(result).toEqual({ created: 0, error: null })
    expect(insert).not.toHaveBeenCalled()
  })

  it('returns the database error instead of throwing, so the caller can alarm', async () => {
    const { admin } = stubAdmin([], 'insert or update violates foreign key')
    const result = await createSubscriptionsForOrder(admin, {
      orderId: 'ord-1',
      userId: 'user-1',
      paymentTokenId: 'tok-1',
      rows: [planned],
      now: NOW,
    })
    expect(result.created).toBe(0)
    expect(result.error).toContain('foreign key')
  })
})
