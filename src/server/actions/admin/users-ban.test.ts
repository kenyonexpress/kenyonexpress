import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of the user ban. The policy (who may ban whom) is proven
 * in lib/admin/user-ban.test.ts; what can only fail here is the plumbing:
 * that the Auth admin API is told the right duration, that the record write
 * goes through the service role and tolerates the column being absent, that
 * an auth failure stops before any record write, and that the audit row is
 * written with the outcome.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
}

/**
 * Replace whatever is queued. `queue()` appends, and `settle()` treats a
 * single entry as sticky, so appending a second result to the beforeEach
 * default returns the default first and the override never. A test that
 * wants the NEXT read to see a specific row says so here.
 */
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

function fakeClient(name: string) {
  return {
    from: (table: string) => ({
      select: (...args: unknown[]) => builder(name, table, 'select', args[0]),
      update: (payload: unknown) => builder(name, table, 'update', payload),
      insert: (payload: unknown) => builder(name, table, 'insert', payload),
    }),
  }
}

const requestClient = fakeClient('request')
const updateUserById = vi.fn()
const adminClient = { ...fakeClient('admin'), auth: { admin: { updateUserById } } }

const requireAdminSession = vi.fn()
const writeAuditLog = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/admin/rbac', () => ({
  requireAdminSession: () => requireAdminSession(),
  isAdminRole: (r: string) => r === 'admin' || r === 'super_admin',
}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const TARGET = '22222222-2222-4222-8222-222222222222'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const { banUser, unbanUser } = await import('./users')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  updateUserById.mockReset()
  updateUserById.mockResolvedValue({ data: { user: { id: TARGET } }, error: null })
  writeAuditLog.mockReset()
  requireAdminSession.mockResolvedValue({ userId: ADMIN, role: 'admin' })
  queue('request:profiles.select', { data: { role: 'customer' }, error: null })
})

describe('banUser', () => {
  it('locks the account in Auth, records it through the service role, and audits', async () => {
    const result = await banUser(null, form({ user_id: TARGET, reason: '  הכחשות עסקה  ' }))
    expect(result).toEqual({ success: 'המשתמש נחסם' })

    expect(updateUserById).toHaveBeenCalledWith(TARGET, { ban_duration: '876000h' })

    const record = calls.find((c) => c.table === 'admin:profiles' && c.op === 'update')
    expect(record?.payload).toMatchObject({ ban_reason: 'הכחשות עסקה', banned_by: ADMIN })
    expect((record?.payload as { banned_at: string }).banned_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(record?.chain).toContainEqual(['eq', ['id', TARGET]])

    // The request client never writes: profiles_update_unified would refuse it.
    expect(calls.some((c) => c.table === 'request:profiles' && c.op === 'update')).toBe(false)

    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'status_change',
      entityType: 'profiles',
      entityId: TARGET,
      changes: { banned: { from: false, to: true }, reason: 'הכחשות עסקה', record_written: true },
    })
  })

  it('still bans when the record columns do not exist yet, and says so', async () => {
    queue('admin:profiles.update', {
      data: null,
      error: { code: '42703', message: 'column "banned_at" does not exist' },
    })
    const result = await banUser(null, form({ user_id: TARGET }))
    expect(result).toEqual({ success: 'המשתמש נחסם. הרישום בפרופיל ממתין למיגרציה 237.' })
    expect(updateUserById).toHaveBeenCalledTimes(1)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      changes: { record_written: false, reason: null },
    })
  })

  it('stops before any record write when the Auth call fails', async () => {
    updateUserById.mockResolvedValue({ data: null, error: { message: 'gotrue down' } })
    const result = await banUser(null, form({ user_id: TARGET }))
    expect(result).toEqual({ error: 'עדכון החסימה נכשל: gotrue down' })
    expect(calls.some((c) => c.table === 'admin:profiles')).toBe(false)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('refuses self-ban and an admin target for a plain admin, without touching Auth', async () => {
    expect(await banUser(null, form({ user_id: ADMIN }))).toEqual({
      error: 'אי אפשר לחסום את עצמך',
    })
    override('request:profiles.select', { data: { role: 'admin' }, error: null })
    expect(await banUser(null, form({ user_id: TARGET }))).toEqual({
      error: 'רק מנהל-על יכול לחסום או לשחרר מנהל',
    })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('refuses a caller outside the admin tier', async () => {
    requireAdminSession.mockResolvedValue({ userId: ADMIN, role: 'support' })
    expect(await banUser(null, form({ user_id: TARGET }))).toEqual({ error: 'אין הרשאה' })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('rejects a malformed id and a missing user before any write', async () => {
    expect(await banUser(null, form({ user_id: 'nope' }))).toEqual({
      error: 'מזהה משתמש לא תקין',
    })
    override('request:profiles.select', { data: null, error: null })
    expect(await banUser(null, form({ user_id: TARGET }))).toEqual({ error: 'משתמש לא נמצא' })
    expect(updateUserById).not.toHaveBeenCalled()
  })
})

describe('unbanUser', () => {
  it('lifts the Auth ban and clears all three record columns', async () => {
    const result = await unbanUser(null, form({ user_id: TARGET }))
    expect(result).toEqual({ success: 'החסימה הוסרה' })
    expect(updateUserById).toHaveBeenCalledWith(TARGET, { ban_duration: 'none' })
    const record = calls.find((c) => c.table === 'admin:profiles' && c.op === 'update')
    expect(record?.payload).toEqual({ banned_at: null, ban_reason: null, banned_by: null })
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      changes: { banned: { from: true, to: false } },
    })
  })
})
