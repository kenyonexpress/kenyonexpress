import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The contract: this runs after the card is charged, so it may never throw, and
 * it may never write to a suppressed address. Everything else is best effort.
 */

const sendEmail = vi.fn()
vi.mock('@/lib/email/resend', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}))

const { sendVoucherEmail } = await import('@/server/payments/voucher-email')

type Row = Record<string, unknown>

/**
 * Minimal stand-in for the query shapes this module uses: a maybeSingle read of
 * profiles, a maybeSingle read of email_suppressions, and an ordered list of
 * vouchers.
 */
function client(tables: {
  profile?: Row | null
  suppression?: Row | null
  vouchers?: Row[]
  throwOn?: string
}) {
  return {
    from(table: string) {
      if (tables.throwOn === table) {
        throw new Error(`boom on ${table}`)
      }
      const result =
        table === 'profiles'
          ? { data: tables.profile ?? null }
          : table === 'email_suppressions'
            ? { data: tables.suppression ?? null }
            : { data: tables.vouchers ?? [] }

      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'order']) {
        chain[method] = () => chain
      }
      chain.maybeSingle = async () => result
      // The voucher list is awaited straight off the builder, so the stand-in
      // has to be thenable exactly as the Supabase builder is.
      // biome-ignore lint/suspicious/noThenProperty: modelling PostgREST's thenable builder is the point
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
      return chain
    },
  } as never
}

const CONTEXT = {
  orderId: 'order-1',
  userId: 'user-1',
  siteUrl: 'https://kenyonexpress.co.il',
}

function voucher(overrides: Row = {}): Row {
  return {
    id: 'v1',
    code: 'ABCDEFGHJK',
    face_value_agorot: 20000,
    coupon_price_agorot: 2000,
    remaining_amount_due_agorot: 18000,
    expires_at: '2026-10-30T10:00:00.000Z',
    products: { name_he: 'ארוחת בוקר' },
    suppliers: { name: 'טעמים גורמה', address: 'דיזנגוף 12', contact_phone: '03-1234567' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sendEmail.mockResolvedValue({ ok: true, id: 'mail-1' })
})

describe('sendVoucherEmail', () => {
  it('sends to the customer with the coupons of the order', async () => {
    const result = await sendVoucherEmail(
      client({ profile: { email: 'dana@example.com', full_name: 'דנה' }, vouchers: [voucher()] }),
      CONTEXT,
    )
    expect(result.sent).toBe(true)
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'dana@example.com', idempotencyKey: 'voucher-email:order-1' }),
    )
    const sent = sendEmail.mock.calls[0]?.[0] as { html: string }
    expect(sent.html).toContain('ABCDE-FGHJK')
  })

  // A finalize can run twice: the webhook and the return page both reconcile
  // the same order. One key means the provider drops the second.
  it('uses a per-order idempotency key so a replayed finalize sends once', async () => {
    const c = client({ profile: { email: 'a@b.co' }, vouchers: [voucher()] })
    await sendVoucherEmail(c, CONTEXT)
    await sendVoucherEmail(c, CONTEXT)
    const keys = sendEmail.mock.calls.map(
      (call) => (call[0] as { idempotencyKey: string }).idempotencyKey,
    )
    expect(new Set(keys).size).toBe(1)
  })

  it('refuses to write to a suppressed address', async () => {
    const result = await sendVoucherEmail(
      client({
        profile: { email: 'bounced@example.com' },
        suppression: { email: 'bounced@example.com' },
        vouchers: [voucher()],
      }),
      CONTEXT,
    )
    expect(result).toEqual({ sent: false, reason: 'suppressed' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('sends nothing for an order with no vouchers', async () => {
    const result = await sendVoucherEmail(
      client({ profile: { email: 'a@b.co' }, vouchers: [] }),
      CONTEXT,
    )
    expect(result).toEqual({ sent: false, reason: 'no_vouchers' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('sends nothing when the profile carries no address', async () => {
    const result = await sendVoucherEmail(client({ profile: { email: null } }), CONTEXT)
    expect(result).toEqual({ sent: false, reason: 'no_address' })
  })

  it('reports the transport reason without throwing', async () => {
    sendEmail.mockResolvedValue({ ok: false, skipped: true, reason: 'no_api_key' })
    const result = await sendVoucherEmail(
      client({ profile: { email: 'a@b.co' }, vouchers: [voucher()] }),
      CONTEXT,
    )
    expect(result).toEqual({ sent: false, reason: 'no_api_key' })
  })

  // The card is already charged by the time this runs.
  it('swallows a database failure rather than failing the finalize', async () => {
    const result = await sendVoucherEmail(client({ throwOn: 'profiles' }), CONTEXT)
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('exception')
  })

  it('handles the joined rows arriving as arrays', async () => {
    await sendVoucherEmail(
      client({
        profile: { email: 'a@b.co' },
        vouchers: [
          voucher({
            products: [{ name_he: 'עיסוי' }],
            suppliers: [{ name: 'ספא', address: null, contact_phone: null }],
          }),
        ],
      }),
      CONTEXT,
    )
    const sent = sendEmail.mock.calls[0]?.[0] as { html: string }
    expect(sent.html).toContain('עיסוי')
    expect(sent.html).toContain('ספא')
  })
})
