import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The saved-card row, which used to multiply.
 *
 * `finalizeOrder` persisted every token the provider returned with a plain
 * insert. A shopper who buys with "save my card" ticked re-tokenizes the same
 * card on every purchase, Cardcom mints a fresh token string each time, and the
 * picker grew one identical "ויזה המסתיימת ב-4242" row per order. The dedupe
 * key is the physical card (profile, last four, brand, expiry); on a match the
 * row is refreshed with the newest token string instead of added.
 *
 * The read is best-effort on purpose: by this line the card has been charged,
 * so a failed lookup falls back to the insert rather than failing the finalize.
 */

type Result = { data: unknown; error: unknown }

const ORDER_ID = 'ord-1'
const USER_ID = 'u-1'
const PAYMENT_ID = 'pay-1'
const FAILURE = { code: '57014', message: 'statement timeout' }

const results = new Map<string, Result>()
const writes: { key: string; payload: unknown }[] = []

function key(table: string, op: string, columns?: unknown): string {
  if (table === 'orders' && op === 'select' && String(columns).includes('gift_recipient_name')) {
    return 'orders.gift'
  }
  return `${table}.${op}`
}

function settle(k: string): Result {
  return results.get(k) ?? { data: null, error: null }
}

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
    insert: (payload: unknown) => {
      writes.push({ key: `${table}.insert`, payload })
      return builder(`${table}.insert`)
    },
    update: (payload: unknown) => {
      writes.push({ key: `${table}.update`, payload })
      return builder(`${table}.update`)
    },
    upsert: () => builder(`${table}.upsert`),
  }),
  rpc: async () => ({ data: null, error: null }),
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

const issueVoucher = vi.fn(async () => ({ id: `v-${issueVoucher.mock.calls.length}` }))
vi.mock('@/server/domain/vouchers/issue', () => ({
  issueVoucher: (...a: unknown[]) => issueVoucher(...(a as [])),
}))
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
vi.mock('@/lib/commerce/order-money-columns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/commerce/order-money-columns')>()
  return {
    ...actual,
    moneyColumnProbe: () => async () => true,
    resolveOrderItemGeneration: async () => 'agorot' as const,
    resolveVoucherRateColumn: async () => 'platform_percent',
  }
})
vi.mock('@/lib/observability/sentry', () => ({ capturePaymentError: vi.fn() }))

const { finalizeOrder } = await import('./finalize')

const TOKEN = {
  token: 'ctok-fresh',
  last4: '4242',
  brand: 'visa',
  expiryMonth: 12,
  expiryYear: 2028,
}

function run() {
  return finalizeOrder({
    orderId: ORDER_ID,
    paymentId: PAYMENT_ID,
    transactionId: 'tx-1',
    token: TOKEN,
  })
}

const tokenWrites = () => writes.filter((w) => w.key.startsWith('payment_tokens.'))

beforeEach(() => {
  issueVoucher.mockClear()
  results.clear()
  writes.length = 0
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
        quantity: 1,
        unit_price_agorot: 6000,
        platform_percent: 10,
        upfront_percent: null,
        commission_percent_snapshot: null,
        paid_on_site_agorot: 6000,
        commission_agorot: 600,
        face_value_agorot: 10000,
        balance_due_agorot: 4000,
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

describe('the token the finalize persists', () => {
  it('inserts a row for a card this profile has never saved', async () => {
    results.set('payment_tokens.select', { data: null, error: null })
    const result = await run()
    expect(result.ok).toBe(true)
    expect(tokenWrites()).toHaveLength(1)
    expect(tokenWrites()[0]).toMatchObject({
      key: 'payment_tokens.insert',
      payload: expect.objectContaining({
        profile_id: USER_ID,
        cardcom_token: 'ctok-fresh',
        last_4: '4242',
      }),
    })
  })

  it('refreshes the existing row for the same physical card, and inserts nothing', async () => {
    results.set('payment_tokens.select', { data: { id: 'tok-row-1' }, error: null })
    const result = await run()
    expect(result.ok).toBe(true)
    expect(tokenWrites()).toHaveLength(1)
    expect(tokenWrites()[0]).toMatchObject({
      key: 'payment_tokens.update',
      payload: expect.objectContaining({ cardcom_token: 'ctok-fresh' }),
    })
  })

  it('falls back to the insert when the dedupe read fails, and still finalizes', async () => {
    // The card is already charged; a duplicate picker row is the acceptable
    // cost of a lookup that timed out, and losing the token is not.
    results.set('payment_tokens.select', { data: null, error: FAILURE })
    const result = await run()
    expect(result.ok).toBe(true)
    expect(tokenWrites()[0]?.key).toBe('payment_tokens.insert')
  })
})
