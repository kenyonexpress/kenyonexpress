import { agorot, formatAgorot } from '@/lib/money'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The admin cashback adjustment. The money rules live in
 * fn_cashback_admin_adjust; what can only fail here is the plumbing: that the
 * email resolves to a profile through the ADMIN client (RLS hides it from the
 * session), that the RPC runs on the SESSION client (auth.uid() is created_by),
 * that the shekel string becomes integer agorot with no float on the way, that
 * the rpc's refusals become Hebrew, and that the audit row follows the ledger.
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

function builder(client: string, table: string, op: string, payload?: unknown): never {
  const record: Call = { table: `${client}:${table}`, op, payload, chain: [] }
  calls.push(record)
  const key = `${client}:${table}.${op}`
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

const rpcCalls: { client: string; name: string; args: unknown }[] = []

function fakeClient(name: string) {
  return {
    from: (table: string) => ({
      select: (...args: unknown[]) => builder(name, table, 'select', args[0]),
    }),
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ client: name, name: fn, args })
      return settle(`${name}:rpc.${fn}`)
    },
  }
}

const adminClient = fakeClient('admin')
const requestClient = fakeClient('request')

const requireSection = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()
const logError = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
vi.mock('@/lib/admin/rbac', () => ({
  requireSection: (...args: unknown[]) => requireSection(...args),
}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const TARGET = '22222222-2222-4222-8222-222222222222'
const KEY = '33333333-3333-4333-8333-333333333333'
const NOT_INSTALLED =
  'יומן הקאשבק אינו מותקן בבסיס הנתונים הזה: מיגרציה 177 טרם הוחלה, ולכן ' +
  'הפונקציה fn_cashback_admin_adjust והטבלה cashback_ledger אינן קיימות עדיין.'

function input(overrides: Record<string, string> = {}) {
  return {
    email: ' Dana@Example.com ',
    amountIls: '12.50',
    reason: 'פיצוי על משלוח מאוחר',
    idempotencyKey: KEY,
    ...overrides,
  }
}

const { adjustCashback } = await import('./cashback')

beforeEach(() => {
  calls.length = 0
  rpcCalls.length = 0
  queues.clear()
  requireSection.mockReset()
  requireSection.mockResolvedValue({ userId: ADMIN, role: 'admin' })
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
  logError.mockReset()
  override('admin:profiles.select', {
    data: { id: TARGET, email: 'dana@example.com' },
    error: null,
  })
  override('request:rpc.fn_cashback_admin_adjust', { data: 'ledger-1', error: null })
})

describe('adjustCashback', () => {
  it('credits in integer agorot through the session rpc, audits and revalidates', async () => {
    const result = await adjustCashback(input())
    expect(result).toEqual({
      success: `בוצע: זוכה ${formatAgorot(agorot(1250))} עבור dana@example.com`,
    })

    // The email lookup goes through the ADMIN client, lowercased and trimmed.
    const lookup = calls.find((c) => c.table === 'admin:profiles' && c.op === 'select')
    expect(lookup?.chain).toContainEqual(['eq', ['email', 'dana@example.com']])
    expect(calls.some((c) => c.table.startsWith('request:'))).toBe(false)

    // The rpc runs on the SESSION client: created_by is auth.uid().
    expect(rpcCalls).toEqual([
      {
        client: 'request',
        name: 'fn_cashback_admin_adjust',
        args: {
          p_user_id: TARGET,
          p_amount_agorot: 1250,
          p_reason: 'פיצוי על משלוח מאוחר',
          p_idempotency: KEY,
        },
      },
    ])
    expect(
      Number.isInteger((rpcCalls[0]?.args as { p_amount_agorot: number }).p_amount_agorot),
    ).toBe(true)

    expect(writeAuditLog).toHaveBeenCalledWith({
      actorId: ADMIN,
      actorRole: 'admin',
      action: 'manual_override',
      entityType: 'cashback_ledger',
      entityId: 'ledger-1',
      metadata: {
        user_id: TARGET,
        user_email: 'dana@example.com',
        amount_agorot: 1250,
        reason: 'פיצוי על משלוח מאוחר',
      },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/cashback')
  })

  it('words a negative amount as a clawback and leaves entityId unset on a non-string id', async () => {
    override('request:rpc.fn_cashback_admin_adjust', { data: 42, error: null })
    const result = await adjustCashback(input({ amountIls: '-3' }))
    expect(result).toEqual({
      success: `בוצע: קוזז ${formatAgorot(agorot(300))} עבור dana@example.com`,
    })
    expect(rpcCalls[0]?.args).toMatchObject({ p_amount_agorot: -300 })
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({ entityId: undefined })
  })

  it('refuses a caller without payments write before any read', async () => {
    requireSection.mockRejectedValue(new Error('forbidden'))
    expect(await adjustCashback(input())).toEqual({ error: 'אין הרשאה' })
    expect(requireSection).toHaveBeenCalledWith('payments', 'write')
    expect(calls).toEqual([])
    expect(rpcCalls).toEqual([])
  })

  it('rejects each malformed field with the schema message, before any read', async () => {
    expect(await adjustCashback(input({ email: 'nope' }))).toEqual({
      error: 'כתובת אימייל לא תקינה',
    })
    expect(await adjustCashback(input({ amountIls: '1.234' }))).toEqual({
      error: 'סכום לא תקין: מספר בשקלים, עד שתי ספרות אחרי הנקודה',
    })
    expect(await adjustCashback(input({ reason: 'לא' }))).toEqual({
      error: 'נדרש נימוק (לפחות 3 תווים)',
    })
    expect(await adjustCashback(input({ idempotencyKey: 'k' }))).toEqual({
      error: 'מפתח בקשה לא תקין',
    })
    expect(calls).toEqual([])
  })

  it('refuses zero and an amount the money module cannot hold as a safe integer', async () => {
    expect(await adjustCashback(input({ amountIls: '0.00' }))).toEqual({
      error: 'הסכום חייב להיות שונה מאפס',
    })
    expect(await adjustCashback(input({ amountIls: '99999999999999999' }))).toEqual({
      error: 'סכום לא תקין',
    })
    expect(calls).toEqual([])
  })

  it('distinguishes a failed profile read from a missing user', async () => {
    override('admin:profiles.select', { data: null, error: { message: 'timeout' } })
    expect(await adjustCashback(input())).toEqual({ error: 'קריאת המשתמש נכשלה, נסה שוב' })
    expect(logError).toHaveBeenCalledWith('cashback.adjust_profile_read_failed', {
      reason: 'timeout',
    })
    override('admin:profiles.select', { data: null, error: null })
    expect(await adjustCashback(input())).toEqual({ error: 'לא נמצא משתמש עם הכתובת הזו' })
    expect(rpcCalls).toEqual([])
  })

  it('names the unapplied migration when the function or table is missing', async () => {
    for (const code of ['42883', '42P01']) {
      override('request:rpc.fn_cashback_admin_adjust', {
        data: null,
        error: { code, message: 'does not exist' },
      })
      expect(await adjustCashback(input())).toEqual({ error: NOT_INSTALLED })
    }
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('translates the rpc refusals and passes anything else through', async () => {
    const cases: [string, string][] = [
      ['admin only', 'אין הרשאה'],
      ['unknown user', 'לא נמצא משתמש עם הכתובת הזו'],
      ['insufficient balance', 'אי אפשר לקזז: היתרה בארנק הלקוח נמוכה מסכום הקיזוז.'],
      ['violates nonneg check', 'אי אפשר לקזז: היתרה בארנק הלקוח נמוכה מסכום הקיזוז.'],
      ['something else', 'something else'],
    ]
    for (const [message, expected] of cases) {
      override('request:rpc.fn_cashback_admin_adjust', {
        data: null,
        error: { code: 'P0001', message },
      })
      expect(await adjustCashback(input())).toEqual({ error: expected })
    }
    expect(writeAuditLog).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
