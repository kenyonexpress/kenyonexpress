import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The transfer and revoke actions against a scripted admin client.
 *
 * The fake builder records every call on every table and answers each
 * terminal (`maybeSingle`, or the awaited chain itself for an insert/update
 * without a select) from a queue keyed by table and verb. That is enough to
 * prove what the guards are, what is written, and what is undone.
 */

const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkUserRateLimit: vi.fn(async () => true),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: async <T>(_name: string, fn: () => Promise<T>) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/gifts/claim-token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gifts/claim-token')>()
  return {
    ...actual,
    createGiftClaimToken: () => ({ token: 'raw-token', hash: 'h'.repeat(64) }),
  }
})

type Call = { table: string; verb: string; args: unknown[] }
const calls: Call[] = []
const answers = new Map<string, unknown[]>()
function answer(key: string, value: unknown) {
  answers.set(key, [...(answers.get(key) ?? []), value])
}
function take(key: string): unknown {
  const queue = answers.get(key) ?? []
  return queue.shift() ?? { data: null, error: null }
}

function builder(table: string) {
  let verb = 'select'
  const b: Record<string, unknown> = {}
  const chain =
    (name: string) =>
    (...args: unknown[]) => {
      if (name === 'select' && verb === 'select') verb = 'select'
      if (['insert', 'update', 'delete'].includes(name)) verb = name
      calls.push({ table, verb: name, args })
      return b
    }
  for (const name of ['select', 'insert', 'update', 'eq', 'is', 'or', 'in', 'not']) {
    b[name] = chain(name)
  }
  b.maybeSingle = async () => take(`${table}.${verb}`)
  // biome-ignore lint/suspicious/noThenProperty: the Supabase builder IS a thenable, and an awaited insert resolves through it
  b.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(take(`${table}.${verb}`)).then(resolve)
  return b
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))

import { revokeVoucherTransfer, transferVoucher } from './gifts'

const VOUCHER = '123e4567-e89b-12d3-a456-426614174000'
const liveRow = {
  id: VOUCHER,
  user_id: 'owner',
  status: 'issued',
  expires_at: '2099-01-01T00:00:00Z',
  product_id: 'prod-1',
  gift_claim_token_hash: null,
  gift_claimed_at: null,
  gift_sent_at: null,
  gift_recipient_name: null,
  gift_recipient_email: null,
  gift_message: null,
}

beforeEach(() => {
  calls.length = 0
  answers.clear()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'owner' } } })
})

describe('transferVoucher', () => {
  it('refuses a visitor with no session before reading anything', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const result = await transferVoucher(VOUCHER, { recipientEmail: 'to@x.co' })
    expect(result).toMatchObject({ ok: false, code: 'AUTH' })
    expect(calls).toEqual([])
  })

  it('refuses bad input and a malformed id without touching the database', async () => {
    expect(await transferVoucher('nope', { recipientEmail: 'to@x.co' })).toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await transferVoucher(VOUCHER, { recipientEmail: 'not-mail' })).toMatchObject({
      code: 'INPUT',
    })
    expect(calls).toEqual([])
  })

  it('mints one link, blanks nothing it should not, and queues one voucher_gifted mail', async () => {
    answer('vouchers.select', { data: liveRow, error: null })
    answer('vouchers.update', { data: { id: VOUCHER }, error: null })
    answer('profiles.select', { data: { full_name: 'דנה' }, error: null })
    answer('products.select', { data: { name_he: 'עיסוי' }, error: null })
    answer('notification_outbox.insert', { data: null, error: null })

    const result = await transferVoucher(VOUCHER, {
      recipientEmail: 'to@x.co',
      recipientName: 'רון',
      message: 'מזל טוב',
    })
    expect(result).toEqual({ ok: true, voucherId: VOUCHER })

    const update = calls.find((c) => c.table === 'vouchers' && c.verb === 'update')
    expect(update?.args[0]).toMatchObject({
      gift_recipient_email: 'to@x.co',
      gift_recipient_name: 'רון',
      gift_message: 'מזל טוב',
      gift_claim_token_hash: 'h'.repeat(64),
      gift_claimed_at: null,
    })
    // The guards live on the UPDATE, so a race is decided by Postgres.
    const guards = calls
      .filter((c) => c.table === 'vouchers')
      .slice(calls.findIndex((c) => c.verb === 'update'))
      .map((c) => `${c.verb}:${String(c.args[0])}`)
    expect(guards).toContain('eq:user_id')
    expect(guards).toContain('eq:status')
    expect(guards).toContain('or:gift_claim_token_hash.is.null,gift_claimed_at.not.is.null')

    const insert = calls.find((c) => c.table === 'notification_outbox' && c.verb === 'insert')
    expect(insert?.args[0]).toMatchObject({
      kind: 'voucher_gifted',
      recipient_email: 'to@x.co',
      dedupe_key: `gift:${VOUCHER}:${'h'.repeat(16)}`,
      payload: {
        claim_token: 'raw-token',
        sender_name: 'דנה',
        recipient_name: 'רון',
        product_name: 'עיסוי',
        gift_message: 'מזל טוב',
      },
    })
    // Not the checkout-only schedule column: naming it is a 42703 before 226.
    expect(update?.args[0]).not.toHaveProperty('gift_deliver_at')
  })

  it('refuses while an unclaimed link is out, and writes nothing', async () => {
    answer('vouchers.select', {
      data: { ...liveRow, gift_claim_token_hash: 'old', gift_sent_at: '2026-09-01T00:00:00Z' },
      error: null,
    })
    const result = await transferVoucher(VOUCHER, { recipientEmail: 'to@x.co' })
    expect(result).toMatchObject({ ok: false, code: 'PENDING_GIFT' })
    expect(calls.some((c) => c.verb === 'update' || c.verb === 'insert')).toBe(false)
  })

  it('lets a claimed gift be sent on again', async () => {
    answer('vouchers.select', {
      data: { ...liveRow, gift_claim_token_hash: 'old', gift_claimed_at: '2026-09-01T00:00:00Z' },
      error: null,
    })
    answer('vouchers.update', { data: { id: VOUCHER }, error: null })
    const result = await transferVoucher(VOUCHER, { recipientEmail: 'to@x.co' })
    expect(result.ok).toBe(true)
  })

  it('puts the row back when the mail cannot be queued, so the sender keeps a code', async () => {
    answer('vouchers.select', { data: liveRow, error: null })
    answer('vouchers.update', { data: { id: VOUCHER }, error: null })
    answer('notification_outbox.insert', { data: null, error: { message: 'outbox down' } })
    answer('vouchers.update', { data: null, error: null })

    const result = await transferVoucher(VOUCHER, { recipientEmail: 'to@x.co' })
    expect(result).toMatchObject({ ok: false, code: 'FAILED' })
    const updates = calls.filter((c) => c.table === 'vouchers' && c.verb === 'update')
    expect(updates).toHaveLength(2)
    expect(updates[1]?.args[0]).toMatchObject({
      gift_claim_token_hash: null,
      gift_recipient_email: null,
      gift_sent_at: null,
    })
  })

  it('reports the lost race when the guarded update matches no row', async () => {
    answer('vouchers.select', { data: liveRow, error: null })
    answer('vouchers.update', { data: null, error: null })
    const result = await transferVoucher(VOUCHER, { recipientEmail: 'to@x.co' })
    expect(result).toMatchObject({ ok: false, code: 'PENDING_GIFT' })
    expect(calls.some((c) => c.table === 'notification_outbox')).toBe(false)
  })
})

describe('revokeVoucherTransfer', () => {
  it('clears the link and kills the waiting mail, and leaves gift_sent_at alone', async () => {
    answer('vouchers.select', {
      data: { id: VOUCHER, gift_claim_token_hash: 'old-hash', gift_claimed_at: null },
      error: null,
    })
    answer('vouchers.update', { data: { id: VOUCHER }, error: null })
    answer('notification_outbox.update', { data: null, error: null })

    expect(await revokeVoucherTransfer(VOUCHER)).toEqual({ ok: true })
    const update = calls.find((c) => c.table === 'vouchers' && c.verb === 'update')
    expect(update?.args[0]).toEqual({
      gift_claim_token_hash: null,
      gift_recipient_name: null,
      gift_recipient_email: null,
      gift_message: null,
    })
    const dead = calls.find((c) => c.table === 'notification_outbox' && c.verb === 'update')
    expect(dead?.args[0]).toMatchObject({ status: 'dead' })
    const keys = calls.find((c) => c.table === 'notification_outbox' && c.verb === 'in')
    expect(keys?.args[1]).toEqual([`gift:${VOUCHER}`, `gift:${VOUCHER}:old-hash`])
  })

  it('cannot take back a gift that was already collected', async () => {
    answer('vouchers.select', {
      data: { id: VOUCHER, gift_claim_token_hash: 'old', gift_claimed_at: '2026-09-02T00:00:00Z' },
      error: null,
    })
    expect(await revokeVoucherTransfer(VOUCHER)).toMatchObject({ ok: false, code: 'CLAIMED' })
    expect(calls.some((c) => c.verb === 'update')).toBe(false)
  })

  it('has nothing to revoke on a coupon with no link', async () => {
    answer('vouchers.select', {
      data: { id: VOUCHER, gift_claim_token_hash: null, gift_claimed_at: null },
      error: null,
    })
    expect(await revokeVoucherTransfer(VOUCHER)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })
})
