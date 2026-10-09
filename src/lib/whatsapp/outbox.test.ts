import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sendWhatsappTemplate } = vi.hoisted(() => ({ sendWhatsappTemplate: vi.fn() }))

vi.mock('@/lib/whatsapp/twilio', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/whatsapp/twilio')>()
  return { ...real, sendWhatsappTemplate }
})

import { buildWhatsappMessage, sendOutboxWhatsapp } from './outbox'

/**
 * The WhatsApp leg of the outbox drain (marathon step 8). What matters:
 * without configuration NOTHING happens (the production deploy has no Twilio
 * account yet), the two templates fill from the payloads the outbox really
 * carries, and a failure is contained -- reported as 'failed', never thrown
 * into the email leg that just succeeded.
 */

const ISSUED_ENV = {
  TWILIO_CONTENT_SID_VOUCHER_ISSUED: 'HX_issued',
  TWILIO_CONTENT_SID_VOUCHER_EXPIRING: 'HX_expiring',
} as unknown as NodeJS.ProcessEnv

function phoneLookup(phone: string | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: { phone }, error: null })
  return {
    admin: {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    } as never,
  }
}

beforeEach(() => {
  sendWhatsappTemplate.mockReset()
  sendWhatsappTemplate.mockResolvedValue({ ok: true, sid: 'SM1' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildWhatsappMessage', () => {
  it('fills the issued template from the first voucher of the real payload shape', () => {
    const message = buildWhatsappMessage(
      'voucher_issued',
      {
        order_id: 'o-1',
        vouchers: [
          {
            id: 'v-1',
            code: 'ABCDE12345',
            supplier_name: 'הקפה של יוסי',
            expires_at: '2026-10-01T00:00:00Z',
          },
        ],
      },
      ISSUED_ENV,
    )
    expect(message).toEqual({
      contentSid: 'HX_issued',
      variables: { '1': 'ABCDE12345', '2': 'הקפה של יוסי', '3': '01.10.2026' },
    })
  })

  it('fills the expiry template from the flat reminder payload', () => {
    const message = buildWhatsappMessage(
      'voucher_expiring',
      { code: 'ABCDE12345', supplier_name: 'הקפה של יוסי', expires_at: '2026-09-06T00:00:00Z' },
      ISSUED_ENV,
    )
    expect(message).toEqual({
      contentSid: 'HX_expiring',
      variables: { '1': 'ABCDE12345', '2': 'הקפה של יוסי', '3': '06.09.2026' },
    })
  })

  it('returns null while the template SIDs await approval (the blocker)', () => {
    expect(
      buildWhatsappMessage(
        'voucher_issued',
        { vouchers: [{ code: 'X' }] },
        {} as unknown as NodeJS.ProcessEnv,
      ),
    ).toBeNull()
  })

  it('returns null for every other kind and for a payload without a code', () => {
    expect(buildWhatsappMessage('order_paid', {}, ISSUED_ENV)).toBeNull()
    expect(buildWhatsappMessage('voucher_issued', { vouchers: [] }, ISSUED_ENV)).toBeNull()
    expect(buildWhatsappMessage('voucher_expiring', { supplier_name: 'x' }, ISSUED_ENV)).toBeNull()
  })
})

describe('sendOutboxWhatsapp', () => {
  function configure() {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'tok')
    vi.stubEnv('TWILIO_WHATSAPP_FROM', 'whatsapp:+1')
    vi.stubEnv('TWILIO_CONTENT_SID_VOUCHER_EXPIRING', 'HX_expiring')
  }

  const ROW = {
    kind: 'voucher_expiring',
    user_id: 'u-1',
    payload: { code: 'ABCDE12345', supplier_name: 'ס', expires_at: '2026-09-06T00:00:00Z' },
  }

  it('does nothing at all on an unconfigured deploy', async () => {
    const { admin } = phoneLookup('0501234567')
    expect(await sendOutboxWhatsapp(admin, ROW)).toBe('skipped')
    expect(sendWhatsappTemplate).not.toHaveBeenCalled()
  })

  it('sends to the customer phone from profiles when configured', async () => {
    configure()
    const { admin } = phoneLookup('050-123-4567')
    expect(await sendOutboxWhatsapp(admin, ROW)).toBe('sent')
    expect(sendWhatsappTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'whatsapp:+972501234567', contentSid: 'HX_expiring' }),
    )
  })

  it('skips a profile with no usable phone rather than guessing', async () => {
    configure()
    const { admin } = phoneLookup(null)
    expect(await sendOutboxWhatsapp(admin, ROW)).toBe('skipped')
    expect(sendWhatsappTemplate).not.toHaveBeenCalled()
  })

  it('contains a provider failure as "failed" instead of throwing into the drain', async () => {
    configure()
    sendWhatsappTemplate.mockResolvedValue({ ok: false, error: 'twilio 500: boom' })
    const { admin } = phoneLookup('0501234567')
    expect(await sendOutboxWhatsapp(admin, ROW)).toBe('failed')
  })

  it('contains even a thrown lookup as "failed"', async () => {
    configure()
    const admin = {
      from: () => {
        throw new Error('db down')
      },
    } as never
    expect(await sendOutboxWhatsapp(admin, ROW)).toBe('failed')
  })
})
