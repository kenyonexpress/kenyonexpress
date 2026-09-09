import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The resend path. Everything here is about one question: does pressing the
 * button actually put a mail on the wire, and is the fact recorded either way.
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

const sendVoucherEmail = vi.fn()
vi.mock('@/server/payments/voucher-email', () => ({
  sendVoucherEmail: (...args: unknown[]) => sendVoucherEmail(...args),
}))

vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))

vi.mock('@/lib/site-url', () => ({ siteUrl: () => 'https://kenyonexpress.co.il' }))

let voucherRow: Record<string, unknown> | null = null
let loadError: string | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq']) chain[method] = () => chain
      chain.maybeSingle = async () =>
        loadError
          ? { data: null, error: { message: loadError } }
          : { data: voucherRow, error: null }
      return chain
    },
  }),
}))

const { resendVoucherEmail } = await import('./vouchers')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const GOOD = { code: 'ABCD1234', reason: 'לקוח מדווח שלא קיבל' }

beforeEach(() => {
  requireSection.mockReset().mockResolvedValue({ userId: 'admin-1', role: 'admin' })
  writeAuditLog.mockReset().mockResolvedValue(undefined)
  checkRateLimit.mockReset().mockResolvedValue(true)
  sendVoucherEmail.mockReset().mockResolvedValue({ sent: true })
  loadError = null
  voucherRow = {
    id: 'v-1',
    code: 'ABCD1234',
    status: 'issued',
    face_value_agorot: 20000,
    coupon_price_agorot: 9900,
    remaining_amount_due_agorot: 10100,
    expires_at: '2027-01-01T00:00:00Z',
    redeemed_at: null,
    supplier_id: 's-1',
    order_id: 'order-9',
    user_id: 'user-9',
    product: { name_he: 'עיסוי' },
    supplier: { name: 'ספא' },
  }
})

describe('resendVoucherEmail', () => {
  it('sends a fresh delivery id, which is what makes the mail leave at all', async () => {
    const result = await resendVoucherEmail(null, form(GOOD))
    expect(result).toEqual({ success: 'המייל נשלח שוב', code: 'ABCD1234' })
    const context = sendVoucherEmail.mock.calls[0]?.[1] as { deliveryId?: string }
    expect(context.deliveryId).toBeTruthy()
    expect(context).toMatchObject({ orderId: 'order-9', userId: 'user-9' })
  })

  it('gives every attempt its own id, so a second press is not swallowed', async () => {
    await resendVoucherEmail(null, form(GOOD))
    await resendVoucherEmail(null, form(GOOD))
    const first = (sendVoucherEmail.mock.calls[0]?.[1] as { deliveryId: string }).deliveryId
    const second = (sendVoucherEmail.mock.calls[1]?.[1] as { deliveryId: string }).deliveryId
    expect(first).not.toBe(second)
  })

  it('refuses without the orders:write section', async () => {
    requireSection.mockRejectedValue(new Error('nope'))
    expect(await resendVoucherEmail(null, form(GOOD))).toEqual({ error: 'אין הרשאה' })
    expect(sendVoucherEmail).not.toHaveBeenCalled()
  })

  it('demands a reason, like the manual redemption next to it', async () => {
    const result = await resendVoucherEmail(null, form({ code: 'ABCD1234', reason: 'x' }))
    expect(result).toEqual({ error: 'חובה לציין סיבה לשליחה חוזרת' })
    expect(sendVoucherEmail).not.toHaveBeenCalled()
  })

  it('limits per voucher and not only per operator', async () => {
    // A limit that counts only the operator still lets one customer be mailed
    // thirty times, and the person harmed by that is not the operator.
    checkRateLimit.mockImplementation(async (key: string) => !key.startsWith('voucher-resend:'))
    expect(await resendVoucherEmail(null, form(GOOD))).toEqual({
      error: 'השובר הזה כבר נשלח שוב לאחרונה',
    })
    expect(checkRateLimit).toHaveBeenCalledWith('voucher-resend:v-1', 3, 3600)
    expect(sendVoucherEmail).not.toHaveBeenCalled()
  })

  it('audits the attempt even when nothing was sent', async () => {
    // "We tried and the address is suppressed" is the answer support needs, and
    // it is not recoverable from a table that records only successes.
    sendVoucherEmail.mockResolvedValue({ sent: false, reason: 'suppressed' })
    const result = await resendVoucherEmail(null, form(GOOD))
    expect(result).toEqual({ error: 'כתובת המייל חסומה לשליחה' })
    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    const entry = writeAuditLog.mock.calls[0]?.[0] as {
      actorId: string
      entityId: string
      changes: { new: Record<string, unknown> }
    }
    expect(entry.actorId).toBe('admin-1')
    expect(entry.entityId).toBe('v-1')
    expect(entry.changes.new).toMatchObject({ resent: false, failure: 'suppressed' })
    expect(entry.changes.new.reason).toBe(GOOD.reason)
  })

  it('names the three failures separately, because they are three different next steps', async () => {
    for (const [reason, message] of [
      ['no_address', 'ללקוח אין כתובת מייל'],
      ['no_vouchers', 'אין שוברים פעילים בהזמנה הזאת'],
      ['exception', 'השליחה נכשלה'],
    ] as const) {
      sendVoucherEmail.mockResolvedValue({ sent: false, reason })
      expect(await resendVoucherEmail(null, form(GOOD))).toEqual({ error: message })
    }
  })

  it('says so when the voucher has no order to mail about', async () => {
    voucherRow = { ...(voucherRow as object), order_id: null }
    expect(await resendVoucherEmail(null, form(GOOD))).toEqual({
      error: 'לשובר הזה אין הזמנה משויכת',
    })
    expect(sendVoucherEmail).not.toHaveBeenCalled()
  })

  it('does not touch the voucher row', async () => {
    // Resend is a delivery operation. Reissuing, extending or re-opening a
    // redeemed code are different decisions with different audit shapes.
    await resendVoucherEmail(null, form(GOOD))
    const entry = writeAuditLog.mock.calls[0]?.[0] as { changes: { new: Record<string, unknown> } }
    expect(entry.changes.new).not.toHaveProperty('status')
    expect(entry.changes.new).not.toHaveProperty('expires_at')
  })
})
