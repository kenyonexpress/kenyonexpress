import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A VOUCHER IS SOMETHING THE CUSTOMER HAS ALREADY PAID FOR, SO "NOT THERE"
 * HAS TO BE TRUE.
 *
 * All three reads in `queries/vouchers.ts` discarded their `error`, and every
 * caller renders the resulting absence as a fact:
 *
 *   getCustomerVouchers      the account page says the customer has no coupons
 *   getCustomerVoucher       the coupon's own page 404s
 *   getVoucherForRedemption  the till answers `not_found`, 404 - AND writes a
 *                            refusal row saying the code does not exist
 *
 * The third is the one that leaves a mark. `recordRefusedScan` feeds the log
 * that exists so a disputed scan can be reconstructed later; a failed read put
 * a record in it for a lookup that never happened, while the customer holding
 * the paid voucher was sent away from the counter.
 *
 * PGRST116 stays an answer here, unlike in the cart. These are `.single()` and
 * `.maybeSingle()` reads of ONE row, where it means "no such row" and every
 * caller already handles it - the cart's `.maybeSingle()` reads are filtered by
 * owner, where the same code can only mean duplicates.
 */

type Result = { data: unknown; error: unknown }

const readResult: Result = { data: null, error: null }

/**
 * A thenable PostgREST builder: awaiting one resolves it with no terminal call,
 * so a mock without `then` cannot reproduce these queries.
 */
function makeBuilder() {
  const builder: Record<string, unknown> = {}
  for (const method of [
    'from',
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
  // biome-ignore lint/suspicious/noThenProperty: see the comment above
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ ...readResult })
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => (makeBuilder().from as (t: string) => unknown)(t),
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeBuilder() }))

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { getCustomerVouchers, getCustomerVoucher, getVoucherForRedemption } = await import(
  './vouchers'
)

const A_UUID = '11111111-2222-3333-4444-555555555555'

/** Each read, with the empty value it must still resolve to on a real miss. */
const READS: Array<{ name: string; run: () => Promise<unknown>; empty: unknown }> = [
  { name: 'getCustomerVouchers', run: () => getCustomerVouchers(), empty: [] },
  { name: 'getCustomerVoucher', run: () => getCustomerVoucher(A_UUID), empty: null },
  {
    name: 'getVoucherForRedemption',
    run: () => getVoucherForRedemption('ABCDEFGHJK', ['sup-1']),
    empty: null,
  },
]

beforeEach(() => {
  readResult.data = null
  readResult.error = null
  logError.mockClear()
})

describe.each(READS)('$name', ({ run, empty }) => {
  it('throws and logs once when the query fails', async () => {
    readResult.error = { code: '57014', message: 'statement timeout' }
    await expect(run()).rejects.toThrow(/statement timeout/)
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('resolves empty and stays silent when the voucher genuinely is not there', async () => {
    readResult.data = Array.isArray(empty) ? [] : null
    await expect(run()).resolves.toEqual(empty)
    expect(logError).not.toHaveBeenCalled()
  })

  it('treats PGRST116 as the no-row answer it is, silently', async () => {
    readResult.data = Array.isArray(empty) ? [] : null
    readResult.error = { code: 'PGRST116', message: 'no rows returned' }
    await expect(run()).resolves.toEqual(empty)
    expect(logError).not.toHaveBeenCalled()
  })
})
