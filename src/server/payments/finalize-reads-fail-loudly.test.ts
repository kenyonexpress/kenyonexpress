import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A SWALLOWED ERROR IN THIS FILE MINTS VOUCHERS.
 *
 * Every other read repaired on 2026-08-20 turned a failure into a false
 * absence somebody read on a screen. This one has a write behind it.
 *
 * `issueVouchersForItem` caps issuance by counting the vouchers already issued
 * for the order item, and its own comment calls that cap the thing that "make[s]
 * webhook replays no-ops". The other half of that sentence, UNIQUE(code),
 * cannot cap anything: every issue mints a fresh random code, so a second pass
 * collides with nothing. The count was read with `const { data: existing }`.
 * A failed read reported zero already issued and the loop minted the full
 * quantity AGAIN - a second set of live vouchers, each redeemable at a counter
 * for real goods, on an order that paid for one set.
 *
 * The path where that is likeliest is the one built for failures:
 * `webhook-dlq.ts` replays a finalize precisely when the first attempt broke.
 *
 * The rest of this file is the same defect one notch down, where it corrupts
 * the DIAGNOSIS rather than the ledger: the webhook alarms "payment verified
 * but finalize failed" on any `ok: false` and prints the reason this function
 * returned. Those reasons were "order not found", "order has no items",
 * "payment not found" and "product has no coupon_expiry_days" - four sentences
 * that send whoever answers the page after a missing row, or after an admin,
 * when the actual incident was a database that stopped answering.
 *
 * The `paid_at` stamp is the boundary. Before it, a throw is safe: the replay
 * re-runs finalize and the caps hold. After it, a replay returns early at
 * `if (order.paid_at)`, so a throw buys an alarm and nothing else - which is
 * why the gift read at the bottom still swallows, and why that is checked here.
 */

type Result = { data: unknown; error: unknown }

const ORDER_ID = 'ord-1'
const USER_ID = 'u-1'
const PAYMENT_ID = 'pay-1'
const FAILURE = { code: '57014', message: 'statement timeout' }

const results = new Map<string, Result>()

function key(table: string, op: string, columns?: unknown): string {
  // Two different reads hit `orders.select`, and only the columns tell them
  // apart: the one at the top of finalize and the gift read at the bottom.
  if (table === 'orders' && op === 'select' && String(columns).includes('gift_recipient_name')) {
    return 'orders.gift'
  }
  return `${table}.${op}`
}

function settle(k: string): Result {
  return results.get(k) ?? { data: null, error: null }
}

/** Proxy builder: any chain method returns itself, and awaiting it resolves. */
function builder(k: string): never {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(k)).then(resolve, reject)
        }
        return () => {
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle(k))
          return proxy
        }
      },
    },
  )
  return proxy as never
}

const admin = {
  from: (table: string) => ({
    select: (columns?: unknown) => builder(key(table, 'select', columns)),
    insert: () => builder(`${table}.insert`),
    update: () => builder(`${table}.update`),
    upsert: () => builder(`${table}.upsert`),
  }),
  rpc: async () => ({ data: null, error: null }),
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

const issueVoucher = vi.fn(async () => ({ id: `v-${issueVoucher.mock.calls.length}` }))
vi.mock('@/server/domain/vouchers/issue', () => ({
  issueVoucher: (...a: unknown[]) => issueVoucher(...(a as [])),
}))

// Everything past the paid_at stamp is best-effort by design and has its own
// tests; stubbing it keeps this file about the reads.
vi.mock('@/server/payments/settlement-events', () => ({
  buildChargeSettledEvents: () => [],
  recordSettlementEvents: async () => undefined,
}))
vi.mock('@/server/payments/invoices', () => ({
  enqueueOrderInvoice: async () => ({ enqueued: false, replay: false, invoiceId: null }),
  issueQueuedInvoice: async () => undefined,
}))
vi.mock('@/server/payments/voucher-email', () => ({ sendVoucherEmail: async () => undefined }))
vi.mock('@/server/payments/gift-vouchers', () => ({
  readGiftIntent: () => null,
  sendOrderGifts: async () => undefined,
}))
vi.mock('@/lib/analytics/server-events', () => ({ sendServerPurchase: async () => undefined }))
vi.mock('@/lib/payments/payment-money-columns', () => ({
  resolvePaymentMoneySchema: async () => ({
    walletAppliedColumn: 'wallet_applied_agorot',
    toAgorot: (v: unknown) => Number(v ?? 0),
  }),
}))
vi.mock('@/lib/commerce/order-money-columns', () => ({
  moneyColumnProbe: () => async () => true,
  resolveVoucherRateColumn: async () => 'platform_percent',
  // The generation-resolved reads (D25 marathon step 1): the mocks pin the
  // post-059 'agorot' answer so the select strings under test keep the exact
  // column names these fixtures were written against.
  resolveOrderGeneration: async () => 'agorot',
  resolveOrderItemGeneration: async () => 'agorot',
  orderCashbackSelect: () => 'cashback_applied_agorot',
  orderItemPriceSelect: () => 'unit_price_agorot, total_price_agorot',
  readOrderCashbackAgorot: (_g: unknown, row: Record<string, unknown> | null) =>
    Math.round(Number(row?.cashback_applied_agorot ?? 0)),
}))

const capturePaymentError = vi.fn()
vi.mock('@/lib/observability/sentry', () => ({
  capturePaymentError: (...a: unknown[]) => capturePaymentError(...a),
}))

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { finalizeOrder } = await import('./finalize')

function run() {
  return finalizeOrder({ orderId: ORDER_ID, paymentId: PAYMENT_ID, transactionId: 'tx-1' })
}

beforeEach(() => {
  issueVoucher.mockClear()
  capturePaymentError.mockClear()
  logError.mockClear()
  results.clear()
  results.set('orders.select', {
    data: {
      id: ORDER_ID,
      user_id: USER_ID,
      status: 'pending',
      paid_at: null,
      cashback_applied_agorot: 0,
    },
    error: null,
  })
  results.set('order_items.select', {
    data: [
      {
        id: 'item-1',
        order_id: ORDER_ID,
        product_id: 'p-1',
        product_type: 'coupon',
        supplier_id: 's-1',
        quantity: 2,
        unit_price_agorot: 6000,
        platform_percent: 10,
        upfront_percent: null,
        commission_percent_snapshot: null,
        paid_on_site_agorot: 12000,
        commission_agorot: 1200,
        face_value_agorot: 20000,
        balance_due_agorot: 8000,
        supplier_immediate_agorot: 0,
        cashback_amount_agorot: 0,
        settlement_status: 'pending',
      },
    ],
    error: null,
  })
  results.set('payments.select', {
    data: {
      id: PAYMENT_ID,
      status: 'redirected',
      wallet_applied_agorot: 0,
      cardcom_account_id: null,
    },
    error: null,
  })
  results.set('products.select', {
    data: [{ id: 'p-1', coupon_expiry_days: 30, offer_valid_until: null }],
    error: null,
  })
  results.set('vouchers.select', { data: [], error: null })
  results.set('orders.gift', { data: null, error: null })
})

describe('the issuance cap, which is the one with a write behind it', () => {
  it('issues NOTHING when the already-issued count cannot be read', async () => {
    results.set('vouchers.select', { data: null, error: FAILURE })

    const result = await run()

    // The assertion this whole file exists for.
    expect(issueVoucher).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ code: 'INTERNAL' })
    expect(logError).toHaveBeenCalledWith(
      'finalize.issued_vouchers_read_failed',
      expect.objectContaining({ orderItemId: 'item-1' }),
    )
    // The alarm still fires, which is the point of keeping the throw inside the
    // try rather than letting it escape to the route as a bare 500.
    expect(capturePaymentError).toHaveBeenCalledTimes(1)
  })

  it('issues the full quantity when nothing has been issued yet', async () => {
    await run()
    expect(issueVoucher).toHaveBeenCalledTimes(2)
  })

  it('issues only the remainder when the count comes back non-empty', async () => {
    // The positive control: without it, "issues nothing" would also pass on a
    // finalize that never reaches the loop at all.
    results.set('vouchers.select', { data: [{ id: 'v-existing' }], error: null })
    await run()
    expect(issueVoucher).toHaveBeenCalledTimes(1)
  })
})

describe('the four sentences the alarm used to print', () => {
  it('does not call a failed order read "order not found"', async () => {
    results.set('orders.select', { data: null, error: FAILURE })
    const result = await run()
    expect(result).toMatchObject({ code: 'INTERNAL' })
    expect(result.ok === false && result.error).toMatch(/statement timeout/)
    expect(capturePaymentError).toHaveBeenCalledTimes(1)
  })

  it('still calls a genuinely missing order "order not found"', async () => {
    results.set('orders.select', { data: null, error: null })
    const result = await run()
    expect(result).toMatchObject({ code: 'NOT_FOUND', error: 'order not found' })
    expect(logError).not.toHaveBeenCalled()
  })

  it('does not call a failed items read "order has no items"', async () => {
    results.set('order_items.select', { data: null, error: FAILURE })
    const result = await run()
    expect(result).toMatchObject({ code: 'INTERNAL' })
    expect(result.ok === false && result.error).toMatch(/statement timeout/)
  })

  it('still calls a genuinely empty order "order has no items"', async () => {
    results.set('order_items.select', { data: [], error: null })
    const result = await run()
    expect(result).toMatchObject({ code: 'STATE_INVALID', error: 'order has no items' })
    expect(logError).not.toHaveBeenCalled()
  })

  it('does not call a failed payment read "payment not found"', async () => {
    results.set('payments.select', { data: null, error: FAILURE })
    const result = await run()
    expect(result).toMatchObject({ code: 'INTERNAL' })
    expect(result.ok === false && result.error).toMatch(/statement timeout/)
  })

  it('still calls a genuinely missing payment "payment not found"', async () => {
    results.set('payments.select', { data: null, error: null })
    const result = await run()
    expect(result).toMatchObject({ code: 'NOT_FOUND', error: 'payment not found' })
    expect(logError).not.toHaveBeenCalled()
  })

  it('does not blame the admin for an unset expiry when the product read failed', async () => {
    results.set('products.select', { data: null, error: FAILURE })
    const result = await run()
    expect(result.ok === false && result.error).toMatch(/statement timeout/)
    expect(result.ok === false && result.error).not.toMatch(/coupon_expiry_days/)
    expect(issueVoucher).not.toHaveBeenCalled()
  })

  it('still refuses, by C7, when the product genuinely has no expiry', async () => {
    results.set('products.select', {
      data: [{ id: 'p-1', coupon_expiry_days: null, offer_valid_until: null }],
      error: null,
    })
    const result = await run()
    expect(result.ok === false && result.error).toMatch(/coupon_expiry_days/)
    expect(issueVoucher).not.toHaveBeenCalled()
  })
})

describe('the boundary at the paid_at stamp', () => {
  it('closes the order anyway when only the gift read fails, by design', async () => {
    // Past the stamp a throw cannot be retried: the replay returns early at
    // `if (order.paid_at)` and never reaches this read again. If this ever
    // starts throwing, this test fails.
    results.set('orders.gift', { data: null, error: FAILURE })
    const result = await run()
    expect(result).toMatchObject({ ok: true, replay: false, orderId: ORDER_ID })
    expect(capturePaymentError).not.toHaveBeenCalled()
  })

  it('reports a replay, silently, for an order that is already paid', async () => {
    results.set('orders.select', {
      data: {
        id: ORDER_ID,
        user_id: USER_ID,
        status: 'paid',
        paid_at: '2026-08-20T00:00:00Z',
        cashback_applied_agorot: 0,
      },
      error: null,
    })
    const result = await run()
    expect(result).toMatchObject({ ok: true, replay: true })
    expect(issueVoucher).not.toHaveBeenCalled()
    expect(logError).not.toHaveBeenCalled()
  })
})
