import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two write tools, tested on the questions that cost money if they are
 * wrong: does the ledger get the right call, does a refusal still leave a
 * record, and does the resend mint a key that will not be swallowed.
 */

const requireSection = vi.fn()
vi.mock('@/lib/admin/rbac', () => ({
  requireSection: (...args: unknown[]) => requireSection(...args),
}))

const writeAuditLog = vi.fn()
vi.mock('@/lib/admin/audit', () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}))

const checkRateLimit = vi.fn()
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}))

vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))

const cookieStore = { set: vi.fn(), delete: vi.fn(), get: vi.fn() }
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))

// `redirect` throws in Next, and the mock has to as well: the view-as actions
// end on it, and a mock that returned would let them fall through to code the
// real runtime never reaches.
const redirect = vi.fn((_url: string): never => {
  throw new Error('NEXT_REDIRECT')
})
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

const rpc = vi.fn()
/** Per-table rows the fake client hands back, keyed by table name. */
let tables: Record<string, { data: unknown; error: { message: string } | null }> = {}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (...args: unknown[]) => rpc(...args),
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'insert', 'limit', 'order', 'in']) {
        chain[method] = () => chain
      }
      chain.maybeSingle = async () => tables[table] ?? { data: null, error: null }
      return chain
    },
  }),
}))

const { creditCustomerWallet, resendTransactionalEmail } = await import('./customer')
const { MAX_MANUAL_CREDIT_AGOROT } = await import('@/lib/admin/manual-credit')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

beforeEach(() => {
  requireSection.mockReset().mockResolvedValue({ userId: 'admin-1', role: 'admin' })
  writeAuditLog.mockReset().mockResolvedValue(undefined)
  checkRateLimit.mockReset().mockResolvedValue(true)
  redirect.mockClear()
  cookieStore.set.mockReset()
  cookieStore.delete.mockReset()
  rpc.mockReset().mockResolvedValue({ error: null })
  tables = {
    profiles: { data: { id: 'user-9', email: 'dana@example.com' }, error: null },
    wallet_accounts: { data: { id: 'acct-1' }, error: null },
    notification_outbox: {
      data: {
        id: 'out-1',
        kind: 'order_confirmation',
        recipient_email: 'dana@example.com',
        payload: { order_ref: 'ABC12345' },
        user_id: 'user-9',
      },
      error: null,
    },
  }
})

const CREDIT = { user_id: 'user-9', amount_ils: '50.00', reason: 'פיצוי על עיכוב' }

describe('creditCustomerWallet', () => {
  it('moves money through fn_wallet_transfer, from platform:adjustments, as admin_credit', async () => {
    const result = await creditCustomerWallet(null, form(CREDIT))

    expect(result).toEqual({ success: 'הארנק זוכה' })
    expect(rpc).toHaveBeenCalledWith(
      'fn_wallet_transfer',
      expect.objectContaining({
        p_credit_account: 'acct-1',
        p_amount_ils: 50,
        // The reason code `WALLET_REASON_LABELS` has always had a label for and
        // has never had a writer. A second spelling would render unlabelled.
        p_reason: 'admin_credit',
      }),
    )
  })

  it('refuses without a reason, before anything moves', async () => {
    const { reason: _drop, ...noReason } = CREDIT
    const result = await creditCustomerWallet(null, form(noReason))

    expect(result).toEqual({ error: 'חובה לציין סיבה לזיכוי' })
    expect(rpc).not.toHaveBeenCalled()
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('refuses a reason too short to be one', async () => {
    expect(await creditCustomerWallet(null, form({ ...CREDIT, reason: 'ok' }))).toEqual({
      error: 'חובה לציין סיבה לזיכוי',
    })
  })

  it('refuses zero, negative and unparseable amounts', async () => {
    for (const amount of ['0', '-5', 'abc', '']) {
      const result = await creditCustomerWallet(null, form({ ...CREDIT, amount_ils: amount }))
      expect(result).toMatchObject({ error: expect.any(String) })
      expect(rpc).not.toHaveBeenCalled()
    }
  })

  it('refuses above the ceiling, which is where a typo stops being a decision', async () => {
    const overIls = MAX_MANUAL_CREDIT_AGOROT / 100 + 1
    expect(
      await creditCustomerWallet(null, form({ ...CREDIT, amount_ils: String(overIls) })),
    ).toEqual({ error: 'הסכום חורג מהתקרה לזיכוי ידני' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('records the attempt in the audit log even when the ledger refuses', async () => {
    // A successes-only log cannot answer "I told the customer it was credited,
    // was it?", which is the question support actually brings.
    rpc.mockResolvedValue({ error: { message: 'insufficient funds' } })

    expect(await creditCustomerWallet(null, form(CREDIT))).toEqual({ error: 'הזיכוי נכשל' })
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'manual_override',
        entityType: 'wallet_accounts',
        changes: expect.objectContaining({ credited: false, reason: 'פיצוי על עיכוב' }),
        after: { credited_agorot: 0 },
      }),
    )
  })

  it('mints a fresh idempotency key per submission, unlike every other caller', async () => {
    // `order:<id>:cashback` is stable because a replayed webhook must not pay
    // twice. A second press here is a second decision by a person watching the
    // balance, and collapsing it would show them a credit that did not happen.
    await creditCustomerWallet(null, form(CREDIT))
    await creditCustomerWallet(null, form(CREDIT))

    const keys = rpc.mock.calls.map((call) => (call[1] as { p_idempotency: string }).p_idempotency)
    expect(keys[0]).not.toBe(keys[1])
    expect(keys[0]).toMatch(/^admin-credit:/)
  })

  it('asks for payments:write, not users:write, because this is money', async () => {
    await creditCustomerWallet(null, form(CREDIT))
    expect(requireSection).toHaveBeenCalledWith('payments', 'write')
  })

  it('refuses when the platform adjustments account is missing', async () => {
    tables.wallet_accounts = { data: null, error: null }
    expect(await creditCustomerWallet(null, form(CREDIT))).toEqual({
      error: 'חשבון ההתאמות של הפלטפורמה חסר',
    })
  })
})

const RESEND = { outbox_id: 'out-1', reason: 'הלקוח לא קיבל' }

describe('resendTransactionalEmail', () => {
  it('re-enqueues the original payload verbatim, under a NEW dedupe key', async () => {
    const result = await resendTransactionalEmail(null, form(RESEND))

    expect(result).toEqual({ success: 'המייל הוכנס לתור השליחה' })
    const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('fn_enqueue_notification')
    expect(args.p_kind).toBe('order_confirmation')
    expect(args.p_payload).toEqual({ order_ref: 'ABC12345' })
    // `fn_enqueue_notification` ends in ON CONFLICT (dedupe_key) DO NOTHING.
    // Reusing the row's own key would return void, report success, and send
    // nothing at all.
    expect(String(args.p_dedupe)).toMatch(/^resend:out-1:/)
    expect(String(args.p_dedupe)).not.toBe('out-1')
  })

  it('mints a different key on a second resend of the same row', async () => {
    await resendTransactionalEmail(null, form(RESEND))
    await resendTransactionalEmail(null, form(RESEND))
    const keys = rpc.mock.calls.map((call) => (call[1] as { p_dedupe: string }).p_dedupe)
    expect(keys[0]).not.toBe(keys[1])
  })

  it('refuses without a reason', async () => {
    expect(await resendTransactionalEmail(null, form({ outbox_id: 'out-1' }))).toEqual({
      error: 'חובה לציין סיבה לשליחה חוזרת',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('stops on the per-row limit, so one customer cannot be mailed thirty times', async () => {
    // First call is the per-operator limit, second is the per-row one.
    checkRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await resendTransactionalEmail(null, form(RESEND))).toEqual({
      error: 'המייל הזה כבר נשלח שוב לאחרונה',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('audits the attempt when the enqueue fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'suppressed' } })
    expect(await resendTransactionalEmail(null, form(RESEND))).toEqual({
      error: 'השליחה החוזרת נכשלה',
    })
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'notification_outbox',
        changes: expect.objectContaining({ queued: false }),
      }),
    )
  })

  it('refuses a row that is not there', async () => {
    tables.notification_outbox = { data: null, error: null }
    expect(await resendTransactionalEmail(null, form(RESEND))).toEqual({ error: 'המייל לא נמצא' })
  })
})
