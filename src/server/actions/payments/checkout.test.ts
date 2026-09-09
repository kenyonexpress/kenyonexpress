import { agorot } from '@/lib/commerce/money'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The seven discarded reads on the charging path, and what each of them said
 * when it failed.
 *
 * This file is the largest single entry the discarded-read inventory held (7),
 * and it is the one where the reads sit between the shopper pressing pay and
 * the order row existing. Every one of them was `const { data } = await ...`,
 * so a failure arrived as an absence and the absence was rendered as a fact:
 *
 *   the saved card the customer is looking at "does not exist"
 *   the address they picked is "not valid"
 *   the products in the cart "no longer exist"
 *   the idempotency guard silently OFF, so a second pending order and a second
 *     stock reservation for one attempt, stopped four statements later by
 *     payments_idempotency_key_key
 *   the supplier snapshot written NULL onto order_items - permanently, because
 *     that snapshot is copied by value and never joined back to
 *   a hard 404 on the return page for a customer who has just been charged
 *
 * The negative controls matter as much as the positives here. Three of these
 * reads have a legitimate empty answer (no such address, no such supplier row,
 * no such order) and the fix must not swallow those into a retry message.
 */

type Result = { data: unknown; error: unknown }

const calls: { table: string; op: string; payload?: unknown }[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
}

function settle(key: string): Result {
  const q = queues.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

/** Same PostgREST stand-in the webhook route test uses: chainable, then-able. */
function builder(table: string, op: string, payload?: unknown): never {
  calls.push({ table, op, payload })
  const key = `${table}.${op}`
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(key)).then(resolve, reject)
        }
        return (...__args: unknown[]) => {
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle(key))
          return proxy
        }
      },
    },
  )
  return proxy as never
}

const adminClient = {
  from: (table: string) => ({
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
    insert: (payload: unknown) => builder(table, 'insert', payload),
    update: (payload: unknown) => builder(table, 'update', payload),
  }),
  rpc: (name: string, payload: unknown) => builder(`rpc:${name}`, 'rpc', payload),
}

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222'
const SUPPLIER_ID = '33333333-3333-4333-8333-333333333333'
const ADDRESS_ID = '44444444-4444-4444-8444-444444444444'
const ORDER_ID = '55555555-5555-4555-8555-555555555555'
const CLIENT_REF = '66666666-6666-4666-8666-666666666666'

const getUser = vi.fn(async () => ({ data: { user: { id: USER_ID } } }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit: async () => true }))
// One controllable provider instance, so the saved-card tests can steer the
// charge outcome and assert what the hosted-page fallback asked for.
const provider = vi.hoisted(() => ({
  chargeWithToken: vi.fn(),
  createLowProfile: vi.fn(),
  verifyLowProfile: vi.fn(),
}))
vi.mock('@/lib/payments', () => ({
  loadCardcomEnv: () => ({
    checkoutEnabled: true,
    terminalNumber: '1000',
    appUrl: 'https://ke.example',
    webhookSecret: 'test-webhook-secret',
  }),
  getCardcomAccounts: () => [],
  getPaymentProvider: () => provider,
}))
vi.mock('@/lib/payments/accounts', () => ({
  selectAccountForSuppliers: () => ({ id: 'platform', terminalNumber: '1000' }),
}))
vi.mock('@/lib/observability/sentry', () => ({ capturePaymentError: vi.fn() }))
const finalizeOrderMock = vi.hoisted(() => vi.fn())
vi.mock('@/server/payments/finalize', () => ({ finalizeOrder: finalizeOrderMock }))
vi.mock('@/server/analytics/track', () => ({
  linkAnalyticsIdentity: vi.fn(),
  stampOrderAttribution: vi.fn(),
  trackServerEvent: vi.fn(),
}))
// Which money columns this database has is resolved by probing it. That is its
// own tested module and its probes would otherwise eat entries out of the
// queues below, so it is stubbed to one fixed generation here.
vi.mock('@/lib/commerce/order-money-columns', () => ({
  moneyColumnProbe: () => async () => ({ error: null }),
  resolveOrderGeneration: async () => 'agorot',
  resolveOrderItemGeneration: async () => 'agorot',
  buildOrderMoneyRow: () => ({ total_agorot: 0 }),
  buildOrderItemMoneyRow: () => ({ paid_on_site_agorot: 0 }),
}))
vi.mock('@/lib/payments/payment-money-columns', () => ({
  resolvePaymentMoneySchema: async () => ({ amountColumn: 'amount_agorot' }),
  paymentMoneyWrite: () => ({ amount_agorot: 0 }),
  readAmountAgorot: () => agorot(0),
}))

const getCart = vi.fn()
const resolveDiscount = vi.fn(async () => ({ code: null as string | null, discountAgorot: 0 }))
vi.mock('@/server/actions/cart', () => ({
  getCart: () => getCart(),
  resolveCheckoutDiscountAgorot: () => resolveDiscount(),
}))

const { beginCheckout, reconcileOrderReturn } = await import('./checkout')

function cartWithOnePhysicalLine() {
  return {
    id: 'cart-1',
    items: [
      {
        product_id: PRODUCT_ID,
        variant_id: null,
        quantity: 1,
        name_he: 'מוצר בדיקה',
        slug: 'test',
        image_url: null,
        unit_price: agorot(12000),
        line_total: agorot(12000),
        type: 'physical' as const,
        available: true,
        platform_fee: agorot(600),
        supplier_due: agorot(11400),
        customer_pays_now: agorot(12000),
        balance_due_at_business: agorot(0),
        platform_percent_bp: 500,
        platform_percent_snapshot: 5,
        coupon_price_unit: null,
        max_quantity: null,
        unavailable_reason: null,
      },
    ],
    item_count: 1,
    subtotal: agorot(12000),
    platform_fee: agorot(600),
    supplier_due: agorot(11400),
    balance_due_at_business: agorot(0),
    coupon: null,
    discount: agorot(0),
    total: agorot(12000),
  }
}

const PRODUCT_ROW = {
  id: PRODUCT_ID,
  type: 'physical',
  is_coupon_enabled: false,
  supplier_id: SUPPLIER_ID,
  platform_percent: 5,
  supplier_split_percent: 95,
  discount_percent: null,
  coupon_price_ils: null,
  cashback_percent: 0,
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    client_ref: CLIENT_REF,
    apply_wallet_ils: 0,
    accept_terms: true,
    save_card: true,
    address_id: ADDRESS_ID,
    channel: 'web',
    ...overrides,
  }
}

const READ_FAILED = { data: null, error: { message: 'connection terminated', code: '08006' } }

beforeEach(() => {
  calls.length = 0
  queues.clear()
  getCart.mockResolvedValue(cartWithOnePhysicalLine())
  provider.chargeWithToken.mockReset()
  provider.createLowProfile.mockReset()
  provider.verifyLowProfile.mockReset()
  finalizeOrderMock.mockReset()
  resolveDiscount.mockResolvedValue({ code: null, discountAgorot: 0 })
})

/** Everything up to and including the stock reservation, so 5b is reached. */
function queueThroughReservation(): void {
  queue('user_addresses.select', { data: { id: ADDRESS_ID, user_id: USER_ID }, error: null })
  queue('payments.select', { data: null, error: null })
  queue('products.select', { data: [PRODUCT_ROW], error: null })
  queue('suppliers.select', { data: [{ id: SUPPLIER_ID, name: 'בית עסק' }], error: null })
  queue('orders.insert', { data: { id: ORDER_ID }, error: null })
  queue('order_items.insert', { data: null, error: null })
  queue('rpc:reserve_order_stock.rpc', { data: [], error: null })
}

/** Did anything get written? The reads under test all run before the order. */
function wrote(table: string): boolean {
  return calls.some((c) => c.table === table && c.op !== 'select')
}

describe('beginCheckout: a discount cap is claimed before the card is charged', () => {
  // The defect these cover was a comment in checkout.ts rather than a bug
  // report: "nothing increments coupons.used_count, so max_uses is enforced as
  // a read of a counter no part of this flow advances". A single-use code was
  // unlimited-use for everybody, and the check passed every time because the
  // counter never moved.

  it('claims the code, after the stock and before any payment row', async () => {
    resolveDiscount.mockResolvedValue({ code: 'SAVE10', discountAgorot: 1000 })
    queueThroughReservation()
    queue('rpc:claim_order_discount.rpc', { data: null, error: null })
    provider.createLowProfile.mockResolvedValue({
      ok: true,
      lowProfileId: 'lp-1',
      redirectUrl: 'https://secure.cardcom.solutions/lp/1',
    })

    await beginCheckout(input())

    const order = calls.findIndex((c) => c.table === 'rpc:reserve_order_stock')
    const claim = calls.findIndex((c) => c.table === 'rpc:claim_order_discount')
    const payment = calls.findIndex((c) => c.table === 'payments' && c.op !== 'select')
    // After the stock so a checkout that is going to fail on stock does not
    // burn a use of the code on the way out; before the payment row for the
    // same reason the reservation is.
    expect(claim).toBeGreaterThan(order)
    expect(claim).toBeLessThan(payment === -1 ? Number.POSITIVE_INFINITY : payment)
  })

  it('does not claim anything when no code is applied', async () => {
    queueThroughReservation()
    provider.createLowProfile.mockResolvedValue({
      ok: true,
      lowProfileId: 'lp-1',
      redirectUrl: 'https://secure.cardcom.solutions/lp/1',
    })

    await beginCheckout(input())

    expect(calls.some((c) => c.table === 'rpc:claim_order_discount')).toBe(false)
  })

  it('refuses the checkout and gives the stock back when the customer has used the code', async () => {
    resolveDiscount.mockResolvedValue({ code: 'SAVE10', discountAgorot: 1000 })
    queueThroughReservation()
    queue('rpc:claim_order_discount.rpc', { data: 'per_user_exhausted', error: null })

    const result = await beginCheckout(input())

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(result.ok === false && result.error).toContain('כבר השתמשת')
    // The hold is handed back explicitly rather than left to lapse. It would
    // free itself within STOCK_RESERVATION_MINUTES, and fifteen minutes of a
    // unit nobody can buy is the cost of not saying so.
    expect(calls.some((c) => c.table === 'rpc:release_order_stock')).toBe(true)
    expect(provider.createLowProfile).not.toHaveBeenCalled()
  })

  it('refuses rather than charging when the claim itself errors', async () => {
    // A cap system that fails open is a cap system that does nothing on the day
    // it matters. Same rule the stock reservation already follows.
    resolveDiscount.mockResolvedValue({ code: 'SAVE10', discountAgorot: 1000 })
    queueThroughReservation()
    queue('rpc:claim_order_discount.rpc', {
      data: null,
      error: { message: 'connection terminated', code: '08006' },
    })

    const result = await beginCheckout(input())

    expect(result).toMatchObject({ ok: false, code: 'INTERNAL' })
    expect(provider.createLowProfile).not.toHaveBeenCalled()
  })

  it('carries on when 194 is not applied yet, instead of refusing every checkout', async () => {
    // The one error that is not fatal. 42883 is "function does not exist", and
    // treating an unapproved migration as a payment outage would take the shop
    // down over a file nobody has agreed to run.
    resolveDiscount.mockResolvedValue({ code: 'SAVE10', discountAgorot: 1000 })
    queueThroughReservation()
    queue('rpc:claim_order_discount.rpc', {
      data: null,
      error: { message: 'function public.claim_order_discount does not exist', code: '42883' },
    })
    provider.createLowProfile.mockResolvedValue({
      ok: true,
      lowProfileId: 'lp-1',
      redirectUrl: 'https://secure.cardcom.solutions/lp/1',
    })

    const result = await beginCheckout(input())

    // Asserted as "the checkout carried on past the claim" rather than as a
    // green result: this harness stops at the payment row, and what is under
    // test is whether 42883 aborts the flow. It does not. The two things a
    // refusal would have done -- answered VALIDATION and handed the stock back
    // -- did not happen, and the run continued to the payment step.
    expect(result.ok === false && result.code).not.toBe('VALIDATION')
    expect(calls.some((c) => c.table === 'rpc:release_order_stock')).toBe(false)
    expect(calls.some((c) => c.table === 'payments' && c.op !== 'select')).toBe(true)
  })
})

describe('beginCheckout: a read that failed is not an answer', () => {
  it('does not tell the shopper their own address is invalid when it could not be read', async () => {
    queue('user_addresses.select', READ_FAILED)

    const result = await beginCheckout(input())

    expect(result).toMatchObject({ ok: false, code: 'INTERNAL' })
    expect(result.ok === false && result.error).toContain('נסו שוב')
    // The point of the separation: ADDRESS_REQUIRED sends the shopper back to
    // the address step, which cannot fix a database that is down.
    expect(result.ok === false && result.code).not.toBe('ADDRESS_REQUIRED')
  })

  it('still rejects an address that belongs to somebody else', async () => {
    queue('user_addresses.select', {
      data: { id: ADDRESS_ID, user_id: 'someone-else' },
      error: null,
    })

    const result = await beginCheckout(input())

    expect(result).toMatchObject({ ok: false, code: 'ADDRESS_REQUIRED' })
  })

  it('refuses the charge when the idempotency replay lookup fails, rather than starting a second one', async () => {
    queue('user_addresses.select', { data: { id: ADDRESS_ID, user_id: USER_ID }, error: null })
    queue('payments.select', READ_FAILED)

    const result = await beginCheckout(input())

    expect(result).toMatchObject({ ok: false, code: 'INTERNAL' })
    // The damage this prevents, asserted as the absence of the three writes a
    // "never seen this client_ref" answer would have gone on to make.
    expect(wrote('orders')).toBe(false)
    expect(wrote('order_items')).toBe(false)
    expect(calls.some((c) => c.table === 'rpc:reserve_order_stock')).toBe(false)
  })

  it('still replays a client_ref that really has been through', async () => {
    queue('user_addresses.select', { data: { id: ADDRESS_ID, user_id: USER_ID }, error: null })
    queue('payments.select', {
      data: {
        id: 'pay-1',
        order_id: ORDER_ID,
        status: 'redirected',
        raw_response: { redirect_url: 'https://secure.cardcom.solutions/lp/1' },
      },
      error: null,
    })

    const result = await beginCheckout(input())

    expect(result).toMatchObject({
      ok: true,
      data: { kind: 'redirect', order_id: ORDER_ID },
    })
  })

  it('does not blame the catalogue when the product read fails', async () => {
    queue('user_addresses.select', { data: { id: ADDRESS_ID, user_id: USER_ID }, error: null })
    queue('payments.select', { data: null, error: null })
    queue('products.select', READ_FAILED)

    const result = await beginCheckout(input())

    expect(result).toMatchObject({ ok: false, code: 'INTERNAL' })
    // "מוצר בעגלה אינו קיים עוד" is what the empty map used to produce, and a
    // shopper who reads it empties a cart that was never the problem.
    expect(result.ok === false && result.error).not.toContain('אינו קיים עוד')
    expect(wrote('orders')).toBe(false)
  })

  it('refuses rather than writing an order whose supplier snapshot could not be read', async () => {
    queue('user_addresses.select', { data: { id: ADDRESS_ID, user_id: USER_ID }, error: null })
    queue('payments.select', { data: null, error: null })
    queue('products.select', { data: [PRODUCT_ROW], error: null })
    queue('suppliers.select', READ_FAILED)

    const result = await beginCheckout(input())

    expect(result).toMatchObject({ ok: false, code: 'INTERNAL' })
    // This is the one whose damage outlives the request: order_items snapshots
    // the business by value and is never joined back to, so a row written now
    // with a null name can never be repaired from the row that was not read.
    expect(wrote('orders')).toBe(false)
    expect(wrote('order_items')).toBe(false)
  })

  it('does not tell the shopper their saved card does not exist when it could not be read', async () => {
    queueThroughReservation()
    queue('payment_tokens.select', READ_FAILED)

    const result = await beginCheckout(input({ token_id: ADDRESS_ID }))

    expect(result).toMatchObject({ ok: false, code: 'INTERNAL' })
    // NOT_FOUND on a card the customer is looking at is the one message that
    // makes deleting it the obvious next move.
    expect(result.ok === false && result.code).not.toBe('NOT_FOUND')
  })

  it('still refuses a token id that belongs to another account', async () => {
    queueThroughReservation()
    queue('payment_tokens.select', {
      data: { id: ADDRESS_ID, profile_id: 'someone-else', expiry_month: 12, expiry_year: 2099 },
      error: null,
    })

    const result = await beginCheckout(input({ token_id: ADDRESS_ID }))

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })

  it('keeps writing the id-only snapshot when the supplier row is genuinely blank', async () => {
    queue('user_addresses.select', { data: { id: ADDRESS_ID, user_id: USER_ID }, error: null })
    queue('payments.select', { data: null, error: null })
    queue('products.select', { data: [PRODUCT_ROW], error: null })
    queue('suppliers.select', { data: [], error: null })
    queue('orders.insert', { data: { id: ORDER_ID }, error: null })

    await beginCheckout(input())

    // The documented fallback in supplierIdentityOf is for exactly this case
    // and must survive the fix: an empty result set is an answer, and a
    // checkout is not failed over a display field.
    const items = calls.find((c) => c.table === 'order_items' && c.op === 'insert')
    expect(items).toBeDefined()
    const rows = items?.payload as { supplier_id: string; supplier_name: string | null }[]
    expect(rows[0]).toMatchObject({ supplier_id: SUPPLIER_ID, supplier_name: null })
  })
})

describe('beginCheckout: the saved-card charge and its 3DS fallback', () => {
  const TOKEN_ID = '77777777-7777-4777-8777-777777777777'

  function queueTokenRow(): void {
    queue('payment_tokens.select', {
      data: {
        id: TOKEN_ID,
        profile_id: USER_ID,
        cardcom_token: 'tok-1',
        cardcom_account_id: null,
        expiry_month: 12,
        expiry_year: 2099,
      },
      error: null,
    })
  }

  function journalled(): string[] {
    return calls
      .filter((c) => c.table === 'payment_events' && c.op === 'insert')
      .map((c) => (c.payload as { event_type: string }).event_type)
  }

  it('journals the charge and ties the payment row to the card it rode on', async () => {
    queueThroughReservation()
    queueTokenRow()
    queue('payments.insert', { data: { id: 'pay-tok' }, error: null })
    provider.chargeWithToken.mockResolvedValue({
      success: true,
      transactionId: 'txn-9',
      failureCode: null,
      failureMessage: null,
      raw: {},
    })
    finalizeOrderMock.mockResolvedValue({ ok: true, orderId: ORDER_ID })

    const result = await beginCheckout(input({ token_id: TOKEN_ID }))

    expect(result).toMatchObject({ ok: true, data: { kind: 'paid', order_id: ORDER_ID } })
    // payments.token_id: the FK 026 created and nothing ever wrote.
    const paymentInsert = calls.find((c) => c.table === 'payments' && c.op === 'insert')
    expect(paymentInsert?.payload).toMatchObject({ token_id: TOKEN_ID })
    // The one charge path with no webhook must leave its own journal trail.
    expect(journalled()).toEqual(['token_charge_requested', 'token_charge_succeeded'])
  })

  it('reports an ordinary decline as a decline, with no hosted-page detour', async () => {
    queueThroughReservation()
    queueTokenRow()
    queue('payments.insert', { data: { id: 'pay-tok' }, error: null })
    provider.chargeWithToken.mockResolvedValue({
      success: false,
      transactionId: null,
      failureCode: '33',
      failureMessage: 'אין כיסוי',
      raw: {},
    })

    const result = await beginCheckout(input({ token_id: TOKEN_ID }))

    expect(result).toMatchObject({ ok: false, code: 'PAYMENT_PROVIDER_ERROR', error: 'אין כיסוי' })
    expect(provider.createLowProfile).not.toHaveBeenCalled()
    expect(journalled()).toEqual(['token_charge_requested', 'token_charge_declined'])
  })

  it('falls back to the hosted page when the issuer demands a 3DS challenge', async () => {
    queueThroughReservation()
    queueTokenRow()
    queue(
      'payments.insert',
      { data: { id: 'pay-tok' }, error: null },
      { data: { id: 'pay-lp' }, error: null },
    )
    provider.chargeWithToken.mockResolvedValue({
      success: false,
      transactionId: null,
      failureCode: '9993',
      failureMessage: 'ThreeDSecure challenge required',
      raw: {},
    })
    provider.createLowProfile.mockResolvedValue({
      lowProfileId: 'lp-77',
      redirectUrl: 'https://pay.example/lp-77',
      raw: {},
    })

    const result = await beginCheckout(input({ token_id: TOKEN_ID, save_card: false }))

    // The shopper gets the page that can show the challenge, not a decline.
    expect(result).toMatchObject({
      ok: true,
      data: { kind: 'redirect', order_id: ORDER_ID, redirect_url: 'https://pay.example/lp-77' },
    })
    // Two payment rows, distinct idempotency keys: the column is UNIQUE and
    // the declined token charge is already holding `lp:`.
    const keys = calls
      .filter((c) => c.table === 'payments' && c.op === 'insert')
      .map((c) => (c.payload as { idempotency_key: string }).idempotency_key)
    expect(keys).toEqual([`lp:${CLIENT_REF}`, `lp3ds:${CLIENT_REF}`])
    // The token is re-minted even though save_card was off: the old one
    // demands a challenge on every server-to-server charge.
    expect(provider.createLowProfile).toHaveBeenCalledWith(
      expect.objectContaining({ saveToken: true }),
    )
    expect(journalled()).toEqual(['token_charge_requested', 'token_charge_declined'])
  })
})

describe('reconcileOrderReturn: the return page after the card was charged', () => {
  it('answers pending, not a 404, when the order read fails', async () => {
    queue('orders.select', READ_FAILED)

    const result = await reconcileOrderReturn(ORDER_ID)

    // `not_found` is not a message on this page, it is notFound(): a hard 404
    // for someone whose money has already left. `pending` renders AutoRefresh,
    // so the next poll re-reads and the customer is not stranded.
    expect(result).toMatchObject({ status: 'pending', order_id: ORDER_ID })
    expect(result.status).not.toBe('not_found')
  })

  it('still 404s an order id that is not the caller own', async () => {
    queue('orders.select', {
      data: { id: ORDER_ID, user_id: 'someone-else', status: 'pending', paid_at: null },
      error: null,
    })

    expect(await reconcileOrderReturn(ORDER_ID)).toEqual({ status: 'not_found' })
  })

  it('answers pending with a reason when the payment read fails', async () => {
    queue('orders.select', {
      data: { id: ORDER_ID, user_id: USER_ID, status: 'pending', paid_at: null },
      error: null,
    })
    queue('payments.select', READ_FAILED)

    const result = await reconcileOrderReturn(ORDER_ID)

    expect(result).toMatchObject({ status: 'pending', reason: 'payment read failed' })
  })
})
