import { hashGiftClaimToken } from '@/lib/gifts/claim-token'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Claiming a gifted coupon: the one place `vouchers.user_id` changes hands.
 * What can only fail here: that the transfer is ONE conditional statement
 * (token hash AND gift_claimed_at IS NULL) so a race yields one claim and one
 * "already claimed", that `gifted_by_user_id` keeps the buyer, that a used or
 * expired coupon is refused rather than handed over, and that the preview
 * exposes nothing the link's holder does not already have.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function override(key: string, result: Result): void {
  queues.set(key, [result])
}

function settle(key: string): Result {
  const q = queues.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

function builder(table: string, op: string, payload?: unknown): never {
  const record: Call = { table, op, payload, chain: [] }
  calls.push(record)
  const key = `${table}.${op}`
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(key)).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          record.chain.push([String(prop), args])
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
    update: (payload: unknown) => builder(table, 'update', payload),
  }),
}

const getUser = vi.fn()
const revalidatePath = vi.fn()
const logError = vi.fn()
const logInfo = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}))
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: (...a: unknown[]) => logError(...a),
    info: (...a: unknown[]) => logInfo(...a),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const ME = '11111111-1111-4111-8111-111111111111'
const BUYER = '22222222-2222-4222-8222-222222222222'
const VOUCHER_ID = '33333333-3333-4333-8333-333333333333'
const TOKEN = 'a'.repeat(43)
const HASH = hashGiftClaimToken(TOKEN)

function voucher(overrides: Record<string, unknown> = {}) {
  return {
    id: VOUCHER_ID,
    user_id: BUYER,
    status: 'issued',
    expires_at: '2099-01-01T00:00:00Z',
    gift_claimed_at: null,
    ...overrides,
  }
}

function find(table: string, op: string): Call | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}

const { claimGift, loadGiftPreview } = await import('./gifts')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: ME } } })
  revalidatePath.mockReset()
  logError.mockReset()
  logInfo.mockReset()
})

describe('claimGift', () => {
  it('rejects a malformed token before the session, and a signed-out caller before the read', async () => {
    expect(await claimGift('short')).toEqual({
      ok: false,
      error: 'קישור המתנה אינו תקין',
      code: 'BAD_TOKEN',
    })
    expect(getUser).not.toHaveBeenCalled()
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await claimGift(TOKEN)).toEqual({
      ok: false,
      error: 'יש להתחבר כדי לקבל את המתנה',
      code: 'AUTH',
    })
    expect(calls).toEqual([])
  })

  it('looks the voucher up by the token HASH and reports an unknown link', async () => {
    expect(await claimGift(TOKEN)).toEqual({
      ok: false,
      error: 'קישור המתנה אינו תקין',
      code: 'NOT_FOUND',
    })
    const read = find('vouchers', 'select')
    expect(read?.chain).toContainEqual(['eq', ['gift_claim_token_hash', HASH]])
    expect(JSON.stringify(read?.chain)).not.toContain(TOKEN)
  })

  it('treats a re-opened claimed gift as a bookmark for its owner and a refusal for anyone else', async () => {
    override('vouchers.select', {
      data: voucher({ user_id: ME, gift_claimed_at: '2026-01-01T00:00:00Z' }),
      error: null,
    })
    expect(await claimGift(TOKEN)).toEqual({ ok: true, voucherId: VOUCHER_ID, alreadyMine: true })
    override('vouchers.select', {
      data: voucher({ gift_claimed_at: '2026-01-01T00:00:00Z' }),
      error: null,
    })
    expect(await claimGift(TOKEN)).toEqual({ ok: false, error: 'המתנה כבר נאספה', code: 'CLAIMED' })
    expect(find('vouchers', 'update')).toBeUndefined()
  })

  it('refuses a coupon that cannot be used rather than transferring it', async () => {
    override('vouchers.select', { data: voucher({ status: 'redeemed' }), error: null })
    expect(await claimGift(TOKEN)).toEqual({
      ok: false,
      error: 'לא ניתן לקבל את הקופון הזה',
      code: 'UNUSABLE',
    })
    override('vouchers.select', {
      data: voucher({ expires_at: '2020-01-01T00:00:00Z' }),
      error: null,
    })
    expect(await claimGift(TOKEN)).toEqual({ ok: false, error: 'תוקף הקופון פג', code: 'UNUSABLE' })
    expect(find('vouchers', 'update')).toBeUndefined()
  })

  it('transfers ownership in one conditional statement and keeps the buyer', async () => {
    override('vouchers.select', { data: voucher(), error: null })
    override('vouchers.update', { data: { id: VOUCHER_ID }, error: null })

    expect(await claimGift(TOKEN)).toEqual({ ok: true, voucherId: VOUCHER_ID, alreadyMine: false })

    const update = find('vouchers', 'update')
    expect(update?.payload).toMatchObject({ user_id: ME, gifted_by_user_id: BUYER })
    expect((update?.payload as { gift_claimed_at: string }).gift_claimed_at).toMatch(/^\d{4}-/)
    // No wallet column, no money: ownership only.
    expect(Object.keys(update?.payload as object)).toEqual([
      'user_id',
      'gifted_by_user_id',
      'gift_claimed_at',
    ])
    expect(update?.chain).toContainEqual(['eq', ['id', VOUCHER_ID]])
    expect(update?.chain).toContainEqual(['eq', ['gift_claim_token_hash', HASH]])
    expect(update?.chain).toContainEqual(['is', ['gift_claimed_at', null]])
    expect(revalidatePath).toHaveBeenCalledWith('/account/coupons')
    expect(logInfo).toHaveBeenCalledWith('gifts.claimed', { voucher_id: VOUCHER_ID })
  })

  it('reports a lost race as already claimed and a failed write as a retry', async () => {
    override('vouchers.select', { data: voucher(), error: null })
    override('vouchers.update', { data: null, error: null })
    expect(await claimGift(TOKEN)).toEqual({ ok: false, error: 'המתנה כבר נאספה', code: 'CLAIMED' })
    override('vouchers.update', { data: null, error: { message: 'down' } })
    expect(await claimGift(TOKEN)).toEqual({
      ok: false,
      error: 'קבלת המתנה נכשלה, נסו שוב',
      code: 'NOT_FOUND',
    })
    expect(logError).toHaveBeenCalledWith('gifts.claim_failed', {
      voucher_id: VOUCHER_ID,
      err: 'down',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('loadGiftPreview', () => {
  it('answers null for a malformed token without a read, and for an unknown one', async () => {
    expect(await loadGiftPreview('nope')).toBeNull()
    expect(calls).toEqual([])
    expect(await loadGiftPreview(TOKEN)).toBeNull()
  })

  it('shows the product, the business and the greeting, and nothing about the buyer', async () => {
    override('vouchers.select', {
      data: {
        status: 'issued',
        expires_at: '2099-01-01T00:00:00Z',
        gift_recipient_name: 'נועה',
        gift_message: 'מזל טוב',
        gift_claimed_at: null,
        products: [{ name_he: 'ארוחה' }],
        suppliers: { name: 'בית עסק' },
      },
      error: null,
    })
    expect(await loadGiftPreview(TOKEN)).toEqual({
      productName: 'ארוחה',
      supplierName: 'בית עסק',
      recipientName: 'נועה',
      message: 'מזל טוב',
      expiresAt: '2099-01-01T00:00:00Z',
      claimed: false,
      usable: true,
    })
  })

  it('reports claimed and unusable states and tolerates missing joins', async () => {
    override('vouchers.select', {
      data: {
        status: 'issued',
        expires_at: '2020-01-01T00:00:00Z',
        gift_recipient_name: null,
        gift_message: null,
        gift_claimed_at: '2026-01-01T00:00:00Z',
        products: [],
        suppliers: null,
      },
      error: null,
    })
    expect(await loadGiftPreview(TOKEN)).toEqual({
      productName: null,
      supplierName: null,
      recipientName: null,
      message: null,
      expiresAt: '2020-01-01T00:00:00Z',
      claimed: true,
      usable: false,
    })
    override('vouchers.select', {
      data: {
        status: 'redeemed',
        expires_at: null,
        gift_recipient_name: null,
        gift_message: null,
        gift_claimed_at: null,
        products: null,
        suppliers: null,
      },
      error: null,
    })
    expect(await loadGiftPreview(TOKEN)).toMatchObject({ usable: false, claimed: false })
  })
})
