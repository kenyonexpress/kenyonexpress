import { hashGiftCardCode } from '@/lib/gift-cards/code'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The gift card's two public verbs. The judgement (active, expired, redeemed,
 * cancelled) is proven in lib/commerce/gift-card.test.ts and the redemption
 * itself is `redeem_gift_card` (234). What can only fail here: that the
 * database is asked by HASH and only about a well-formed code, that a
 * malformed or rate-limited attempt costs no read, that the rpc's refusal
 * tokens become sentences, and that the credited amount is integer agorot
 * read back from the card.
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

const rpcCalls: { name: string; args: unknown }[] = []

const adminClient = {
  from: (table: string) => ({
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
  }),
  rpc: async (name: string, args: unknown) => {
    rpcCalls.push({ name, args })
    return settle(`rpc.${name}`)
  },
}

const getUser = vi.fn()
const checkRateLimit = vi.fn()
const revalidatePath = vi.fn()
const logError = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  getClientIp: async () => '203.0.113.9',
}))
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CODE = 'abcd-efgh-jkmn-pqrs'
const HASH = hashGiftCardCode(CODE)
const MALFORMED = 'הקוד צריך להיות באורך 16 תווים, כפי שמופיע במייל.'
const NOT_FOUND = 'הקוד לא נמצא. בדקו שהוקלד בדיוק כפי שמופיע במייל.'
const RATE_LIMITED = 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.'

function form(code: string): FormData {
  const fd = new FormData()
  fd.set('code', code)
  return fd
}

function card(overrides: Record<string, unknown> = {}) {
  return {
    amount_agorot: 15000,
    status: 'active',
    expires_at: '2099-01-01T00:00:00.000Z',
    redeemed_at: null,
    ...overrides,
  }
}

const { checkGiftCardBalance, redeemGiftCard } = await import('./gift-cards')

beforeEach(() => {
  calls.length = 0
  rpcCalls.length = 0
  queues.clear()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  checkRateLimit.mockReset()
  checkRateLimit.mockResolvedValue(true)
  revalidatePath.mockReset()
  logError.mockReset()
})

describe('checkGiftCardBalance', () => {
  it('refuses a malformed code and a rate-limited IP before any read', async () => {
    expect(await checkGiftCardBalance({ ok: false }, form('abcd'))).toEqual({
      ok: false,
      error: MALFORMED,
    })
    // 0, 1, I, L, O and U are outside the alphabet, so this is a typo, not a code.
    expect(await checkGiftCardBalance({ ok: false }, form('0000-0000-0000-0000'))).toEqual({
      ok: false,
      error: MALFORMED,
    })
    checkRateLimit.mockResolvedValue(false)
    expect(await checkGiftCardBalance({ ok: false }, form(CODE))).toEqual({
      ok: false,
      error: RATE_LIMITED,
    })
    expect(checkRateLimit).toHaveBeenCalledWith('gift_card_check:203.0.113.9', 20, 3600)
    expect(calls).toEqual([])
  })

  it('asks the database by hash only and answers the face value of an active card', async () => {
    override('gift_cards.select', { data: card(), error: null })
    expect(await checkGiftCardBalance({ ok: false }, form(CODE))).toEqual({
      ok: true,
      state: 'active',
      balanceAgorot: 15000,
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
    const read = calls.find((c) => c.table === 'gift_cards')
    expect(read?.chain).toContainEqual(['eq', ['code_hash', HASH]])
    expect(JSON.stringify(read?.chain)).not.toContain('ABCDEFGH')
  })

  it('answers zero for an expired card and not-found for an unknown one', async () => {
    override('gift_cards.select', {
      data: card({ expires_at: '2020-01-01T00:00:00.000Z' }),
      error: null,
    })
    expect(await checkGiftCardBalance({ ok: false }, form(CODE))).toMatchObject({
      ok: true,
      state: 'expired',
      balanceAgorot: 0,
    })
    override('gift_cards.select', { data: null, error: null })
    expect(await checkGiftCardBalance({ ok: false }, form(CODE))).toEqual({
      ok: false,
      error: NOT_FOUND,
    })
  })

  it('throws, and logs, when the read itself fails rather than answering not-found', async () => {
    override('gift_cards.select', { data: null, error: { message: 'timeout' } })
    await expect(checkGiftCardBalance({ ok: false }, form(CODE))).rejects.toThrow(
      'gift card read failed: timeout',
    )
    expect(logError).toHaveBeenCalledWith('gift_card.read_failed', { reason: 'timeout' })
  })
})

describe('redeemGiftCard', () => {
  it('sends a signed-out caller to login before looking at the code', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await redeemGiftCard({ ok: false }, form(CODE))).toEqual({
      ok: false,
      needsLogin: true,
      error: 'כדי לממש צריך להתחבר לחשבון.',
    })
    expect(rpcCalls).toEqual([])
  })

  it('refuses a malformed code and a rate-limited user before the rpc', async () => {
    expect(await redeemGiftCard({ ok: false }, form('abc'))).toEqual({
      ok: false,
      error: MALFORMED,
    })
    checkRateLimit.mockResolvedValue(false)
    expect(await redeemGiftCard({ ok: false }, form(CODE))).toEqual({
      ok: false,
      error: RATE_LIMITED,
    })
    expect(checkRateLimit).toHaveBeenCalledWith(`gift_card_redeem:${USER_ID}`, 10, 3600)
    expect(rpcCalls).toEqual([])
  })

  it('credits the wallet through the rpc, by hash, and reports the amount read back', async () => {
    override('gift_cards.select', { data: card(), error: null })
    expect(await redeemGiftCard({ ok: false }, form(CODE))).toEqual({
      ok: true,
      creditedAgorot: 15000,
    })
    expect(rpcCalls).toEqual([
      { name: 'redeem_gift_card', args: { p_code_hash: HASH, p_user_id: USER_ID } },
    ])
    expect(revalidatePath).toHaveBeenCalledWith('/account/wallet')
  })

  it('reports zero when the card cannot be read back after a successful rpc', async () => {
    expect(await redeemGiftCard({ ok: false }, form(CODE))).toEqual({ ok: true, creditedAgorot: 0 })
  })

  it('translates each refusal token, and falls back to not-found for an unknown one', async () => {
    const cases: [string, string][] = [
      ['not_found', NOT_FOUND],
      ['expired', 'תוקף הגיפט קארד פג ולא ניתן לממש אותו.'],
      ['cancelled', 'הגיפט קארד בוטל. לבירור אפשר לפנות לשירות הלקוחות.'],
      ['redeemed', 'הגיפט קארד כבר מומש.'],
      ['wallet_missing', 'לא הצלחנו לזכות את הארנק. נסו שוב מאוחר יותר.'],
      ['something_new', NOT_FOUND],
    ]
    for (const [token, message] of cases) {
      override('rpc.redeem_gift_card', { data: token, error: null })
      expect(await redeemGiftCard({ ok: false }, form(CODE))).toEqual({ ok: false, error: message })
    }
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reports a failed rpc with a retry line and logs the reason', async () => {
    override('rpc.redeem_gift_card', { data: null, error: { message: 'down' } })
    expect(await redeemGiftCard({ ok: false }, form(CODE))).toEqual({
      ok: false,
      error: 'לא הצלחנו לממש את הקוד, נסו שוב.',
    })
    expect(logError).toHaveBeenCalledWith('gift_card.redeem_failed', {
      userId: USER_ID,
      reason: 'down',
    })
  })
})
