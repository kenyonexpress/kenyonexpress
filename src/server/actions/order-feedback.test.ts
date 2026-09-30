import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The plumbing of private order feedback. The shapes are proven in
 * lib/orders/feedback.test.ts; what can only fail here is that the write goes
 * through the REQUEST client (so 247's INSERT policy decides eligibility),
 * that a signed-out or rate-limited caller stops before any write, that the
 * three refusals the policy and the UNIQUE can return come back as their
 * Hebrew sentences, and that the owner's copy is mailed to the shop inbox
 * with the order id as its idempotency key, without a mail failure ever
 * failing the customer.
 */

const ORDER = '11111111-1111-4111-8111-111111111111'
const USER = { id: 'user-1', email: 'dana@example.com', user_metadata: { full_name: 'דנה' } }

const getUser = vi.hoisted(() => vi.fn())
const insert = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn())
const checkRateLimit = vi.hoisted(() => vi.fn())
const sendEmail = vi.hoisted(() => vi.fn())
const revalidatePath = vi.hoisted(() => vi.fn())
const logWarn = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('the feedback write must not use the service role')
  },
}))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit }))
vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/contact-address', () => ({ contactEmail: () => 'info@kenyonexpress.co.il' }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => Promise<unknown>) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: logWarn, error: vi.fn() },
}))

import { submitOrderFeedback } from './order-feedback'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: USER } })
  checkRateLimit.mockResolvedValue(true)
  insert.mockResolvedValue({ error: null })
  from.mockImplementation((table: string) => {
    if (table !== 'order_feedback') throw new Error(`unexpected table ${table}`)
    return { insert }
  })
  sendEmail.mockResolvedValue({ ok: true, id: 'mail-1' })
})

describe('submitOrderFeedback', () => {
  it('writes the row on the request client and mails the owner a private copy', async () => {
    const result = await submitOrderFeedback(
      form({ orderId: ORDER, rating: '2', body: '  המשלוח איחר  ' }),
    )
    expect(result).toEqual({ ok: true })

    expect(insert).toHaveBeenCalledWith({
      order_id: ORDER,
      user_id: USER.id,
      rating: 2,
      body: 'המשלוח איחר',
    })

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const mail = sendEmail.mock.calls[0]?.[0]
    expect(mail.to).toBe('info@kenyonexpress.co.il')
    expect(mail.replyTo).toBe(USER.email)
    expect(mail.idempotencyKey).toBe(`order-feedback:${ORDER}`)
    expect(mail.subject).toContain('2/5')
    expect(mail.text).toContain('המשלוח איחר')
    expect(mail.text).toContain('לא מתפרסם באתר')

    expect(revalidatePath).toHaveBeenCalledWith(`/account/orders/${ORDER}`)
  })

  it('stores null, not an empty string, for a rating without text', async () => {
    await submitOrderFeedback(form({ orderId: ORDER, rating: '5', body: '   ' }))
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ rating: 5, body: null }))
  })

  it('refuses bad input before touching the session', async () => {
    const result = await submitOrderFeedback(form({ orderId: ORDER }))
    expect(result).toEqual({ ok: false, reason: 'invalid', error: 'בחרו דירוג בין 1 ל-5' })
    expect(getUser).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()

    const bad = await submitOrderFeedback(form({ orderId: 'x', rating: '3' }))
    expect(bad.ok).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it('stops a signed-out caller before any write or mail', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const result = await submitOrderFeedback(form({ orderId: ORDER, rating: '4' }))
    expect(result).toMatchObject({ ok: false, reason: 'signed_out' })
    expect(insert).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('stops a rate-limited caller before any write', async () => {
    checkRateLimit.mockResolvedValue(false)
    const result = await submitOrderFeedback(form({ orderId: ORDER, rating: '4' }))
    expect(result).toMatchObject({ ok: false, reason: 'rate_limited' })
    expect(checkRateLimit).toHaveBeenCalledWith(`order-feedback:${USER.id}`, 10, 3600)
    expect(insert).not.toHaveBeenCalled()
  })

  it.each([
    ['42501', 'not_eligible', 'אפשר לשלוח משוב רק על הזמנה ששולמה.'],
    ['23505', 'already_sent', 'כבר שלחתם משוב על ההזמנה הזו. תודה!'],
    ['PGRST205', 'not_applied', 'המשוב עוד לא פתוח. נסו שוב בקרוב.'],
  ])('translates a %s from the policy into "%s" and does not mail', async (code, reason, text) => {
    insert.mockResolvedValue({ error: { code, message: 'refused' } })
    const result = await submitOrderFeedback(form({ orderId: ORDER, rating: '4' }))
    expect(result).toEqual({ ok: false, reason, error: text })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reports an unknown write failure as a failure, with a log line', async () => {
    insert.mockResolvedValue({ error: { code: '08006', message: 'gone' } })
    const result = await submitOrderFeedback(form({ orderId: ORDER, rating: '4' }))
    expect(result).toMatchObject({ ok: false, reason: 'error' })
    expect(logWarn).toHaveBeenCalledWith('order_feedback.insert_failed', {
      orderId: ORDER,
      code: '08006',
    })
  })

  it('keeps the customer success when the owner mail fails; the row is the record', async () => {
    sendEmail.mockResolvedValue({ ok: false, reason: 'resend 500' })
    const result = await submitOrderFeedback(form({ orderId: ORDER, rating: '4' }))
    expect(result).toEqual({ ok: true })
    expect(logWarn).toHaveBeenCalledWith('order_feedback.notice_not_sent', {
      orderId: ORDER,
      reason: 'resend 500',
    })
  })

  it('stays quiet when mail is simply not configured', async () => {
    sendEmail.mockResolvedValue({ ok: false, skipped: true, reason: 'no_api_key' })
    const result = await submitOrderFeedback(form({ orderId: ORDER, rating: '4' }))
    expect(result).toEqual({ ok: true })
    expect(logWarn).not.toHaveBeenCalled()
  })
})
