import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * "YOU HAVE NO ORDERS" HAS TO BE TRUE.
 *
 * `getMyOrders` already carried the comment describing this exact failure -
 * "`orders` comes back null, and every customer's order list renders as 'you
 * have no orders' instead of as an error" - and then wrote
 * `const { data: rows }` anyway. The probe it refers to fixes the COLUMN NAME
 * cause of a null read. A timeout, a dropped connection or a policy change
 * produce the same null, and the same sentence, with nothing in any log.
 *
 * `getOrderDetail` reads six times, and two of those are worse than an empty
 * list:
 *
 *   order_items   the order row carries the total, so a failed items read
 *                 rendered a complete-looking order with NO lines in it
 *   vouchers      the coupon the customer bought, on the page they open AT
 *                 THE COUNTER. A discarded error showed the line with no code
 *                 and no QR - indistinguishable from "this was never issued".
 *
 * The invoice summary read at the bottom of that file KEEPS swallowing, and
 * that is checked here too, because it is a decision and not an oversight: the
 * error it is written for is 42P01 on a database where migration 107 has not
 * been applied, and an order page that 500s because a feature is unapplied
 * would be a worse answer than a missing link.
 */

type Result = { data: unknown; error: unknown }

/** Per-table answers, so one read can fail while the others succeed. */
const results: Record<string, Result> = {}

function setAll(value: Result) {
  for (const table of ['orders', 'order_items', 'products', 'suppliers', 'vouchers', 'invoices']) {
    results[table] = { ...value }
  }
}

/**
 * A thenable PostgREST builder: awaiting one resolves it with no terminal call,
 * so a mock without `then` cannot reproduce these reads.
 *
 * `from()` returns a FRESH builder rather than mutating a table field on the
 * shared one. `getOrderDetail` opens three reads inside a single `Promise.all`
 * from one client, so all three `.from()` calls run before any of them is
 * awaited; a shared field would leave every one of them answering as the last
 * table named. Measured: with that version, failing the `products` read made
 * the `vouchers` case fail instead, and the products case pass while doing
 * nothing.
 */
function tableBuilder(table: string) {
  const builder: Record<string, unknown> = {}
  for (const method of [
    'select',
    'eq',
    'in',
    'is',
    'not',
    'or',
    'order',
    'limit',
    'range',
    'single',
    'maybeSingle',
  ]) {
    builder[method] = () => builder
  }
  builder.from = (t: string) => tableBuilder(t)
  // biome-ignore lint/suspicious/noThenProperty: see the comment above
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ ...(results[table] ?? { data: null, error: null }) })
  return builder
}

function makeBuilder() {
  return tableBuilder('')
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeBuilder() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
  }),
}))
// The money-column probe runs its own reads before the ones under test; it is
// pinned to one generation here so a failure cannot come from it instead.
vi.mock('@/lib/commerce/order-money-columns', () => ({
  moneyColumnProbe: () => async () => true,
  resolveOrderGeneration: async () => 'agorot',
  resolveOrderItemGeneration: async () => 'agorot',
  orderItemPriceSelect: () => 'unit_price_agorot, total_price_agorot',
  orderMoneySelect: () => 'total_agorot',
  readOrderMoney: (_g: unknown, row: Record<string, unknown> | null | undefined) => ({
    subtotalAgorot: Number(row?.subtotal_agorot ?? 0),
    totalAgorot: Number(row?.total_agorot ?? 0),
    walletAppliedAgorot: 0,
  }),
}))
vi.mock('@/lib/vouchers/qr-image', () => ({ voucherQrDataUrl: async () => null }))

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { getMyOrders, getOrderDetail } = await import('./orders')

const ORDER_ID = 'ord-1'
const FAILURE = { code: '57014', message: 'statement timeout' }

function orderRow() {
  return {
    id: ORDER_ID,
    user_id: 'u-1',
    status: 'paid',
    created_at: '2026-08-01T00:00:00Z',
    paid_at: '2026-08-01T00:00:00Z',
    total_agorot: 12000,
    address_id: null,
    order_items: [],
  }
}

function itemRow() {
  return {
    id: 'item-1',
    product_id: 'p-1',
    product_type: 'coupon',
    supplier_id: 's-1',
    quantity: 1,
    unit_price_agorot: 12000,
    total_price_agorot: 12000,
    paid_on_site_agorot: 2000,
    balance_due_agorot: 10000,
    settlement_status: 'pending',
    item_status: 'active',
  }
}

beforeEach(() => {
  setAll({ data: [], error: null })
  results.orders = { data: [orderRow()], error: null }
  logError.mockClear()
})

describe('getMyOrders', () => {
  it('throws and logs once when the order read fails', async () => {
    results.orders = { data: null, error: FAILURE }
    await expect(getMyOrders()).rejects.toThrow(/statement timeout/)
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('resolves an empty list, silently, when the customer genuinely has none', async () => {
    results.orders = { data: [], error: null }
    await expect(getMyOrders()).resolves.toEqual([])
    expect(logError).not.toHaveBeenCalled()
  })
})

describe('getOrderDetail', () => {
  beforeEach(() => {
    results.orders = { data: orderRow(), error: null }
    results.order_items = { data: [itemRow()], error: null }
  })

  it.each(['orders', 'order_items', 'products', 'suppliers', 'vouchers'])(
    'throws and logs once when the %s read fails',
    async (table) => {
      results[table] = { data: null, error: FAILURE }
      await expect(getOrderDetail(ORDER_ID)).rejects.toThrow(/statement timeout/)
      expect(logError).toHaveBeenCalledTimes(1)
    },
  )

  it('renders the order, silently, when every read genuinely returns its rows', async () => {
    const detail = await getOrderDetail(ORDER_ID)
    expect(detail?.id).toBe(ORDER_ID)
    expect(detail?.lines).toHaveLength(1)
    expect(logError).not.toHaveBeenCalled()
  })

  it('returns null, silently, for an order that is genuinely not the caller own', async () => {
    // The negative control that matters most: a 404 must still be a 404, or the
    // ownership check would start answering 500 for every foreign id.
    results.orders = { data: null, error: null }
    await expect(getOrderDetail(ORDER_ID)).resolves.toBeNull()
    expect(logError).not.toHaveBeenCalled()
  })

  it('keeps rendering when only the invoice table is missing, by design', async () => {
    // 42P01 on a database without migration 107. This read is deliberately the
    // one that still swallows; if that ever changes, this fails.
    results.invoices = { data: null, error: { code: '42P01', message: 'relation does not exist' } }
    const detail = await getOrderDetail(ORDER_ID)
    expect(detail?.invoice ?? null).toBeNull()
    expect(logError).not.toHaveBeenCalled()
  })
})
