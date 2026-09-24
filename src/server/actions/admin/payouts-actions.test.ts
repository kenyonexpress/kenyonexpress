import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of supplier payout runs. Every action is a thin wrapper
 * over a SECURITY DEFINER RPC, so what is proven here is the wrapper: the
 * section gate returns the Hebrew error, the RPC is called with the parsed
 * arguments, the "feature not installed" Postgres codes become the one
 * operator sentence (and are logged), the known money-rule messages are
 * translated, a generate run reads the statement back so a rollover is not
 * reported as a created statement, and every success writes an audit row.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
}

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
    // Keyed as `<client>:rpc/<fn>.rpc` so each function has its own queue.
    rpc: (fn: string, args: unknown) => builder(name, `rpc/${fn}`, 'rpc', args),
  }
}

const requestClient = fakeClient('request')

const requireSection = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()
const logError = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
vi.mock('@/lib/admin/rbac', () => ({
  requireSection: (s: string, a: string) => requireSection(s, a),
}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: (...args: unknown[]) => logError(...args),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const SUPPLIER = '22222222-2222-4222-8222-222222222222'
const STATEMENT = '33333333-3333-4333-8333-333333333333'

const GENERATE = 'request:rpc/generate_payout_statement.rpc'
const APPROVE = 'request:rpc/approve_payout_statement.rpc'
const MARK_PAID = 'request:rpc/mark_payout_statement_paid.rpc'
const CANCEL = 'request:rpc/cancel_payout_statement.rpc'

const NOT_INSTALLED_PREFIX = 'מסך התשלומים לספקים אינו מותקן בבסיס הנתונים הזה'

const period = { supplierId: SUPPLIER, periodStart: '2026-08-01', periodEnd: '2026-08-31' }

const {
  generatePayoutStatement,
  approvePayoutStatement,
  markPayoutStatementPaid,
  cancelPayoutStatement,
} = await import('./payouts')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
  logError.mockReset()
  requireSection.mockReset()
  requireSection.mockResolvedValue({ userId: ADMIN, role: 'admin' })
})

describe('generatePayoutStatement', () => {
  it('returns the Hebrew error when the payments gate throws, and calls no RPC', async () => {
    requireSection.mockRejectedValue(new Error('forbidden'))
    expect(await generatePayoutStatement(period)).toEqual({ error: 'אין הרשאה' })
    expect(requireSection).toHaveBeenCalledWith('payments', 'write')
    expect(calls).toHaveLength(0)
  })

  it('refuses a period that does not run forwards, before the RPC', async () => {
    expect(await generatePayoutStatement({ ...period, periodEnd: '2026-07-01' })).toEqual({
      error: 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה',
    })
    expect(await generatePayoutStatement({ ...period, supplierId: 'nope' })).toEqual({
      error: 'ספק לא תקין',
    })
    expect(calls).toHaveLength(0)
  })

  it('calls the RPC with the period, reads the run back, and reports a created statement', async () => {
    queue(GENERATE, { data: STATEMENT, error: null })
    queue('request:payout_statements.select', {
      data: {
        statement_number: 'PS-0042',
        status: 'pending_approval',
        rolled_over: false,
        total_payout_ils: '350.00',
        min_payout_ils: '100.00',
      },
      error: null,
    })
    expect(await generatePayoutStatement(period)).toEqual({
      success: 'נוצר דוח PS-0042 להמתנה לאישור',
    })

    const rpc = calls.find((c) => c.table === 'request:rpc/generate_payout_statement')
    expect(rpc?.payload).toEqual({
      p_supplier_id: SUPPLIER,
      p_period_start: '2026-08-01',
      p_period_end: '2026-08-31',
    })
    const read = calls.find((c) => c.table === 'request:payout_statements')
    expect(read?.chain).toContainEqual(['eq', ['id', STATEMENT]])

    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      actorId: ADMIN,
      actorRole: 'admin',
      action: 'created',
      entityType: 'payout_statements',
      entityId: STATEMENT,
      metadata: {
        supplier_id: SUPPLIER,
        period_start: '2026-08-01',
        period_end: '2026-08-31',
        rolled_over: false,
        total_payout_ils: '350.00',
      },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/payouts')
  })

  it('reports a rollover as a rollover, not as a created statement', async () => {
    queue(GENERATE, { data: STATEMENT, error: null })
    queue('request:payout_statements.select', {
      data: {
        statement_number: 'PS-0043',
        status: 'cancelled',
        rolled_over: true,
        total_payout_ils: '80.00',
        min_payout_ils: '100.00',
      },
      error: null,
    })
    expect(await generatePayoutStatement(period)).toEqual({
      success: 'הריצה מתגלגלת: 80.00 ש"ח מתחת למינימום של 100.00 ש"ח. הסכום ייאסף בריצה הבאה.',
    })
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      metadata: { rolled_over: true, total_payout_ils: '80.00' },
    })
  })

  it('skips the read-back when the RPC returns no id, and still audits', async () => {
    queue(GENERATE, { data: null, error: null })
    expect(await generatePayoutStatement(period)).toEqual({
      success: 'נוצר דוח  להמתנה לאישור',
    })
    expect(calls.some((c) => c.table === 'request:payout_statements')).toBe(false)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      entityId: undefined,
      metadata: { rolled_over: false, total_payout_ils: null },
    })
  })

  it('names the missing migration for undefined_function, and logs it', async () => {
    queue(GENERATE, {
      data: null,
      error: { code: '42883', message: 'function generate_payout_statement does not exist' },
    })
    const result = await generatePayoutStatement(period)
    expect(result.error).toMatch(new RegExp(`^${NOT_INSTALLED_PREFIX}`))
    expect(logError).toHaveBeenCalledWith('payouts.not_installed', {
      rpc: 'generate_payout_statement',
      code: '42883',
      reason: 'function generate_payout_statement does not exist',
    })
    expect(writeAuditLog).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('translates the money-rule messages and passes anything else through', async () => {
    const cases: [string, string][] = [
      [
        'P0001: live statement already exists for supplier',
        'כבר קיים דוח פעיל לספק הזה בתקופה הזו. בטל אותו או בחר תקופה אחרת.',
      ],
      ['unknown supplier', 'ספק לא נמצא'],
      ['admin only', 'אין הרשאה'],
      [
        'statement not yet available',
        'הדוח עדיין בהמתנה: לא כל השורות עברו את תקופת ההחזקה של 3 ימי עסקים.',
      ],
      ['period overlaps a paid statement', 'period overlaps a paid statement'],
    ]
    for (const [message, expected] of cases) {
      override(GENERATE, { data: null, error: { code: 'P0001', message } })
      expect(await generatePayoutStatement(period)).toEqual({ error: expected })
    }
    expect(logError).not.toHaveBeenCalled()
  })
})

describe('approvePayoutStatement', () => {
  it('rejects a malformed id before the RPC', async () => {
    expect(await approvePayoutStatement('nope')).toEqual({ error: 'מזהה לא תקין' })
    expect(calls).toHaveLength(0)
  })

  it('approves through the RPC and audits the transition', async () => {
    expect(await approvePayoutStatement(STATEMENT)).toEqual({ success: 'הדוח אושר לתשלום' })
    const rpc = calls.find((c) => c.table === 'request:rpc/approve_payout_statement')
    expect(rpc?.payload).toEqual({ p_statement_id: STATEMENT })
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'status_change',
      entityType: 'payout_statements',
      entityId: STATEMENT,
      changes: { status: { from: 'pending_approval', to: 'approved' } },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/payouts')
  })

  it('reports the RPC failure and the gate', async () => {
    override(APPROVE, { data: null, error: { code: 'P0001', message: 'admin only' } })
    expect(await approvePayoutStatement(STATEMENT)).toEqual({ error: 'אין הרשאה' })
    requireSection.mockRejectedValue(new Error('no'))
    expect(await approvePayoutStatement(STATEMENT)).toEqual({ error: 'אין הרשאה' })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('markPayoutStatementPaid', () => {
  it('requires a reconcilable payment reference', async () => {
    expect(await markPayoutStatementPaid({ statementId: STATEMENT, reference: ' 12 ' })).toEqual({
      error: 'נדרשת אסמכתת תשלום',
    })
    expect(await markPayoutStatementPaid({ statementId: 'x', reference: 'TRX-1' })).toEqual({
      error: 'מזהה לא תקין',
    })
    expect(calls).toHaveLength(0)
  })

  it('marks paid with the trimmed reference and keeps it in the audit metadata', async () => {
    expect(
      await markPayoutStatementPaid({ statementId: STATEMENT, reference: '  BANK-77  ' }),
    ).toEqual({ success: 'הדוח סומן כשולם' })
    const rpc = calls.find((c) => c.table === 'request:rpc/mark_payout_statement_paid')
    expect(rpc?.payload).toEqual({ p_statement_id: STATEMENT, p_payment_reference: 'BANK-77' })
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'status_change',
      entityId: STATEMENT,
      changes: { status: { from: 'approved', to: 'paid' } },
      metadata: { payment_reference: 'BANK-77' },
    })
  })

  it('names the missing migration for undefined_table, and the gate', async () => {
    override(MARK_PAID, {
      data: null,
      error: { code: '42P01', message: 'relation payout_statements does not exist' },
    })
    const result = await markPayoutStatementPaid({ statementId: STATEMENT, reference: 'TRX-1' })
    expect(result.error).toMatch(new RegExp(`^${NOT_INSTALLED_PREFIX}`))
    expect(logError).toHaveBeenCalledWith(
      'payouts.not_installed',
      expect.objectContaining({ rpc: 'mark_payout_statement_paid', code: '42P01' }),
    )
    requireSection.mockRejectedValue(new Error('no'))
    expect(await markPayoutStatementPaid({ statementId: STATEMENT, reference: 'TRX-1' })).toEqual({
      error: 'אין הרשאה',
    })
  })
})

describe('cancelPayoutStatement', () => {
  it('rejects a malformed id before the RPC', async () => {
    expect(await cancelPayoutStatement('')).toEqual({ error: 'מזהה לא תקין' })
    expect(calls).toHaveLength(0)
  })

  it('cancels through the RPC and audits the release', async () => {
    expect(await cancelPayoutStatement(STATEMENT)).toEqual({
      success: 'הדוח בוטל והשורות שוחררו לריצה הבאה',
    })
    const rpc = calls.find((c) => c.table === 'request:rpc/cancel_payout_statement')
    expect(rpc?.payload).toEqual({ p_statement_id: STATEMENT })
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'status_change',
      entityId: STATEMENT,
      changes: { status: { from: 'live', to: 'cancelled' } },
    })
  })

  it('translates the hold message and reports the gate', async () => {
    override(CANCEL, {
      data: null,
      error: { code: 'P0001', message: 'available_at is in the future' },
    })
    expect(await cancelPayoutStatement(STATEMENT)).toEqual({
      error: 'הדוח עדיין בהמתנה: לא כל השורות עברו את תקופת ההחזקה של 3 ימי עסקים.',
    })
    requireSection.mockRejectedValue(new Error('no'))
    expect(await cancelPayoutStatement(STATEMENT)).toEqual({ error: 'אין הרשאה' })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})
