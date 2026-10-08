import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The "tell me when it is back" action (STEP 58). Pinned: a malformed product
 * id and a bad address are refused before any read; the honeypot answers
 * success and writes nothing; a guest with no address is told to give one; a
 * signed-in shopper's session address outranks the typed one and carries the
 * user id; an in-stock product is refused with a plain message so the cron
 * never mails "it is back" about a product that never left; a sold-out
 * variant of an in-stock product is accepted; the RPC is the only writer, and
 * its failure is a generic error, never a thrown exception.
 */

const mock = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  rpc: vi.fn(),
  rows: {} as Record<string, unknown>,
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: mock.checkRateLimit,
  getClientIp: mock.getClientIp,
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mock.user }, error: null }) },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mock.rpc,
    from: (table: string) => {
      const chain = () => b
      const b = {
        select: vi.fn(chain),
        eq: vi.fn(chain),
        is: vi.fn(chain),
        maybeSingle: vi.fn(async () => ({ data: mock.rows[table] ?? null, error: null })),
      }
      return b
    },
  }),
}))

import { joinStockWaitlist } from './stock-alerts'

const P = '11111111-1111-4111-8111-111111111111'
const V = '22222222-2222-4222-8222-222222222222'
const U = '33333333-3333-4333-8333-333333333333'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const EMPTY = { ok: false }

beforeEach(() => {
  mock.user = null
  mock.checkRateLimit.mockReset().mockResolvedValue(true)
  mock.getClientIp.mockReset().mockResolvedValue('1.2.3.4')
  mock.rpc.mockReset().mockResolvedValue({ data: null, error: null })
  mock.rows = {
    products: { id: P, status: 'active', stock_quantity: 0 },
    product_variants: null,
  }
})

describe('joinStockWaitlist', () => {
  it('refuses a bad id and a bad address before any read or write', async () => {
    expect((await joinStockWaitlist(EMPTY, form({ productId: 'nope', email: 'a@b.co' }))).ok).toBe(
      false,
    )
    const bad = await joinStockWaitlist(EMPTY, form({ productId: P, email: 'not-an-email' }))
    expect(bad.ok).toBe(false)
    expect(bad.error).toBe('כתובת מייל לא תקינה')
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.checkRateLimit).not.toHaveBeenCalled()
  })

  it('answers success to the honeypot and writes nothing', async () => {
    const result = await joinStockWaitlist(
      EMPTY,
      form({ productId: P, email: 'bot@example.com', company: 'Acme' }),
    )
    expect(result.ok).toBe(true)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('asks a guest for an address when none was typed', async () => {
    const result = await joinStockWaitlist(EMPTY, form({ productId: P, email: '' }))
    expect(result).toEqual({ ok: false, error: 'נא למלא כתובת מייל.' })
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('is rate limited per IP under the stock-alert key', async () => {
    mock.checkRateLimit.mockResolvedValue(false)
    const result = await joinStockWaitlist(EMPTY, form({ productId: P, email: 'a@example.com' }))
    expect(result.ok).toBe(false)
    expect(mock.checkRateLimit).toHaveBeenCalledWith('stock-alert:1.2.3.4', 5, 3600)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('joins a guest by the typed address, lowercased, with no user id', async () => {
    const result = await joinStockWaitlist(
      EMPTY,
      form({ productId: P, email: '  Someone@Example.com ' }),
    )
    expect(result).toEqual({ ok: true, message: 'נעדכן אותך במייל ברגע שהמוצר יחזור למלאי.' })
    expect(mock.rpc).toHaveBeenCalledWith('join_stock_waitlist', {
      p_product_id: P,
      p_email: 'someone@example.com',
      p_variant_id: null,
      p_user_id: null,
    })
  })

  it("uses the session's address over the typed one and records the user id", async () => {
    mock.user = { id: U, email: 'Me@Example.com' }
    const result = await joinStockWaitlist(EMPTY, form({ productId: P, email: 'other@x.com' }))
    expect(result.ok).toBe(true)
    expect(mock.rpc).toHaveBeenCalledWith('join_stock_waitlist', {
      p_product_id: P,
      p_email: 'me@example.com',
      p_variant_id: null,
      p_user_id: U,
    })
  })

  it('lets a signed-in shopper join with an empty email field', async () => {
    mock.user = { id: U, email: 'me@example.com' }
    const result = await joinStockWaitlist(EMPTY, form({ productId: P, email: '' }))
    expect(result.ok).toBe(true)
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })

  it('refuses a product that is on the shelf, so the cron never mails about it', async () => {
    mock.rows.products = { id: P, status: 'active', stock_quantity: 3 }
    const result = await joinStockWaitlist(EMPTY, form({ productId: P, email: 'a@example.com' }))
    expect(result).toEqual({ ok: false, error: 'המוצר במלאי עכשיו ואפשר להזמין אותו.' })
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('accepts a sold-out variant of an in-stock product and passes the variant through', async () => {
    mock.rows.products = { id: P, status: 'active', stock_quantity: 3 }
    mock.rows.product_variants = { id: V, stock_quantity: 0 }
    const result = await joinStockWaitlist(
      EMPTY,
      form({ productId: P, variantId: V, email: 'a@example.com' }),
    )
    expect(result.ok).toBe(true)
    expect(mock.rpc.mock.calls[0]?.[1]).toMatchObject({ p_variant_id: V })
  })

  it('refuses a variant that does not belong to the product', async () => {
    mock.rows.product_variants = null
    const result = await joinStockWaitlist(
      EMPTY,
      form({ productId: P, variantId: V, email: 'a@example.com' }),
    )
    expect(result).toEqual({ ok: false, error: 'הווריאציה לא נמצאה.' })
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('reports a missing product and an RPC failure as plain errors', async () => {
    mock.rows.products = null
    expect(await joinStockWaitlist(EMPTY, form({ productId: P, email: 'a@example.com' }))).toEqual({
      ok: false,
      error: 'המוצר לא נמצא.',
    })
    mock.rows.products = { id: P, status: 'active', stock_quantity: 0 }
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'unknown product' } })
    const failed = await joinStockWaitlist(EMPTY, form({ productId: P, email: 'a@example.com' }))
    expect(failed.ok).toBe(false)
    expect(failed.error).toBe('השמירה נכשלה. נסו שוב מאוחר יותר.')
  })
})
