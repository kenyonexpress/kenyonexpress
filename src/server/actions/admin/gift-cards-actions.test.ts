import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The admin cancel verb (STEP 48). The row's shape is 234's; what can only
 * fail here is the plumbing: the section guard, that the UPDATE carries
 * `status = 'issued'` in its WHERE so a redemption that got there first wins,
 * that each refusal is a Hebrew sentence, and that the audit row follows the
 * write with the reason the admin typed.
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
    update: (...args: unknown[]) => builder(table, 'update', args[0]),
  }),
}

const requireSection = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/admin/rbac', () => ({
  requireSection: (...args: unknown[]) => requireSection(...args),
}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const CARD = '22222222-2222-4222-8222-222222222222'

function issued(overrides: Record<string, unknown> = {}) {
  return {
    id: CARD,
    status: 'issued',
    amount_agorot: 15000,
    code_last4: '7K2M',
    purchaser_user_id: '33333333-3333-4333-8333-333333333333',
    order_id: '44444444-4444-4444-8444-444444444444',
    ...overrides,
  }
}

const { cancelGiftCard } = await import('./gift-cards')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  requireSection.mockReset()
  requireSection.mockResolvedValue({ userId: ADMIN, role: 'admin' })
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
})

describe('cancelGiftCard', () => {
  it('asks for payments:write and refuses without it, before any read', async () => {
    requireSection.mockRejectedValueOnce(new Error('forbidden'))
    expect(await cancelGiftCard({ id: CARD, reason: 'חיוב בוטל' })).toEqual({ error: 'אין הרשאה' })
    expect(requireSection).toHaveBeenCalledWith('payments', 'write')
    expect(calls).toHaveLength(0)
  })

  it('refuses a short reason and a bad id without touching the table', async () => {
    expect(await cancelGiftCard({ id: CARD, reason: 'x' })).toEqual({
      error: 'נדרש נימוק (לפחות 3 תווים)',
    })
    expect(await cancelGiftCard({ id: 'nope', reason: 'חיוב בוטל' })).toEqual({
      error: 'מזהה גיפט קארד לא תקין',
    })
    expect(calls).toHaveLength(0)
  })

  it('cancels an issued card with the status guard in the WHERE and audits the reason', async () => {
    override('gift_cards.select', { data: issued(), error: null })
    override('gift_cards.update', { data: { id: CARD }, error: null })

    const result = await cancelGiftCard({ id: CARD, reason: 'ההזמנה זוכתה' })
    expect(result.error).toBeUndefined()
    expect(result.success).toContain('7K2M')
    expect(result.success).toContain('150')

    const update = calls.find((c) => c.op === 'update')
    expect(update?.payload).toEqual({ status: 'cancelled' })
    expect(update?.chain).toEqual(
      expect.arrayContaining([
        ['eq', ['id', CARD]],
        ['eq', ['status', 'issued']],
      ]),
    )

    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    const audit = writeAuditLog.mock.calls[0]?.[0] as Record<string, unknown>
    expect(audit).toMatchObject({
      actorId: ADMIN,
      actorRole: 'admin',
      action: 'updated',
      entityType: 'gift_cards',
      entityId: CARD,
      before: { status: 'issued' },
      after: { status: 'cancelled' },
    })
    expect(audit.changes).toMatchObject({
      status: ['issued', 'cancelled'],
      reason: 'ההזמנה זוכתה',
      amount_agorot: 15000,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/gift-cards')
  })

  it('refuses a redeemed or cancelled card in Hebrew and writes nothing', async () => {
    override('gift_cards.select', { data: issued({ status: 'redeemed' }), error: null })
    expect((await cancelGiftCard({ id: CARD, reason: 'חיוב בוטל' })).error).toContain('כבר נטען')

    override('gift_cards.select', { data: issued({ status: 'cancelled' }), error: null })
    expect((await cancelGiftCard({ id: CARD, reason: 'חיוב בוטל' })).error).toBe(
      'הגיפט קארד כבר מבוטל.',
    )

    expect(calls.some((c) => c.op === 'update')).toBe(false)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('reports a card the holder redeemed between the read and the write, without an audit row', async () => {
    override('gift_cards.select', { data: issued(), error: null })
    override('gift_cards.update', { data: null, error: null })

    const result = await cancelGiftCard({ id: CARD, reason: 'חיוב בוטל' })
    expect(result.error).toContain('כבר נטען')
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('names migration 234 when the table is missing, and the unknown card otherwise', async () => {
    override('gift_cards.select', { data: null, error: { code: 'PGRST205', message: 'no table' } })
    expect((await cancelGiftCard({ id: CARD, reason: 'חיוב בוטל' })).error).toContain('234')

    override('gift_cards.select', { data: null, error: null })
    expect(await cancelGiftCard({ id: CARD, reason: 'חיוב בוטל' })).toEqual({
      error: 'הגיפט קארד לא נמצא',
    })
  })
})
