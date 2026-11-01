import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The webhook that carries two unrelated things and must not confuse them.
 *
 * A DELIVERY RECEIPT is how a message's fate becomes knowable at all: the POST
 * that sent it answered `queued`, and `Price` is null until this arrives.
 * AN INBOUND MESSAGE is almost always somebody replying הסר -- which Twilio
 * forwards and does nothing about, because its own opt-out list is English.
 *
 * The auth is not decoration. This endpoint WRITES OPT-OUTS, so an unverified
 * caller could silence any customer's coupon codes by posting their number.
 */

const AUTH_TOKEN = 'test-auth-token'
const URL_CONFIGURED = 'https://kenyonexpress.co.il/api/webhooks/twilio-sms'

interface Recorded {
  updates: { table: string; values: Record<string, unknown>; sid: string }[]
  upserts: { table: string; values: Record<string, unknown> }[]
  upsertError: { code?: string; message: string } | null
}

const recorded: Recorded = { updates: [], upserts: [], upsertError: null }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (_column: string, sid: string) => {
          recorded.updates.push({ table, values, sid })
          return { error: null }
        },
      }),
      upsert: async (values: Record<string, unknown>) => {
        recorded.upserts.push({ table, values })
        return { error: recorded.upsertError }
      },
    }),
  }),
}))

const { POST } = await import('./route')

/** Twilio's scheme: the exact public URL plus every param sorted, HMAC-SHA1. */
function sign(params: Record<string, string>): string {
  const data =
    URL_CONFIGURED +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join('')
  return createHmac('sha1', AUTH_TOKEN).update(Buffer.from(data, 'utf-8')).digest('base64')
}

function post(params: Record<string, string>, signature?: string): NextRequest {
  const body = new URLSearchParams(params).toString()
  return new NextRequest(URL_CONFIGURED, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature ?? sign(params),
    },
    body,
  })
}

beforeEach(() => {
  recorded.updates = []
  recorded.upserts = []
  recorded.upsertError = null
  vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN)
  vi.stubEnv('TWILIO_SMS_WEBHOOK_URL', URL_CONFIGURED)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('auth', () => {
  it('refuses an unsigned request', async () => {
    const response = await POST(post({ MessageStatus: 'delivered', MessageSid: 'SM1' }, ''))
    expect(response.status).toBe(401)
    expect(recorded.updates).toEqual([])
  })

  it('refuses a wrong signature', async () => {
    const response = await POST(post({ MessageStatus: 'delivered', MessageSid: 'SM1' }, 'bm90'))
    expect(response.status).toBe(401)
  })

  it('refuses a signature computed over different parameters', async () => {
    // The replay this prevents: a valid signature lifted from one callback and
    // reused on a body naming somebody else's number.
    const signature = sign({ MessageStatus: 'delivered', MessageSid: 'SM1' })
    const response = await POST(post({ Body: 'הסר', From: '+972501234567' }, signature))
    expect(response.status).toBe(401)
  })

  it('refuses everything when there is no token to verify with', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '')
    const response = await POST(post({ MessageStatus: 'delivered', MessageSid: 'SM1' }))
    expect(response.status).toBe(401)
  })
})

describe('the delivery receipt', () => {
  it('records the status, the price and the currency', async () => {
    const response = await POST(
      post({
        MessageSid: 'SM1',
        MessageStatus: 'delivered',
        Price: '-0.00750',
        PriceUnit: 'USD',
      }),
    )

    expect(response.status).toBe(200)
    expect(recorded.updates).toHaveLength(1)
    expect(recorded.updates[0]?.sid).toBe('SM1')
    expect(recorded.updates[0]?.values).toMatchObject({
      status: 'delivered',
      // Sign flipped, and exact: agorot would have rounded this to 1.
      price_micro: 7500,
      price_currency: 'USD',
    })
  })

  it('does not write a price until the receipt carries one', async () => {
    // The POST response reports price: null. A zero would claim it was free.
    await POST(post({ MessageSid: 'SM1', MessageStatus: 'sent' }))
    expect(recorded.updates[0]?.values).not.toHaveProperty('price_micro')
    expect(recorded.updates[0]?.values).toMatchObject({ status: 'sent' })
  })

  it('records a failure with its Twilio error code', async () => {
    await POST(
      post({
        MessageSid: 'SM1',
        MessageStatus: 'undelivered',
        ErrorCode: '30003',
        ErrorMessage: 'Unreachable destination handset',
      }),
    )
    expect(recorded.updates[0]?.values).toMatchObject({
      status: 'undelivered',
      error_code: 30003,
    })
  })

  it('leaves the row alone for a status the constraint would refuse', async () => {
    // Writing it would be a 23514 that loses the whole receipt, including the
    // price -- the part that cannot be recovered later.
    const response = await POST(post({ MessageSid: 'SM1', MessageStatus: 'read' }))
    expect(response.status).toBe(200)
    expect(recorded.updates).toEqual([])
  })
})

describe('the inbound opt-out Twilio does not handle', () => {
  it('records הסר and confirms in Hebrew', async () => {
    const response = await POST(post({ From: '+972501234567', Body: 'הסר', MessageSid: 'SM2' }))

    expect(response.status).toBe(200)
    expect(recorded.upserts).toHaveLength(1)
    expect(recorded.upserts[0]?.table).toBe('sms_opt_outs')
    expect(recorded.upserts[0]?.values).toMatchObject({
      to_e164: '+972501234567',
      keyword: 'הסר',
      // Explicitly cleared: a number that opted out, resumed and opted out
      // again must end opted out.
      resumed_at: null,
    })
    expect(await response.text()).toContain('הוסרתם')
  })

  it('records the English keywords too, because Twilio’s block does not travel', async () => {
    await POST(post({ From: '+972501234567', Body: 'STOP', MessageSid: 'SM3' }))
    expect(recorded.upserts).toHaveLength(1)
  })

  it('answers 500 when the opt-out could not be written', async () => {
    // The one case worth a non-200. A retry is a repair here, and continuing to
    // message somebody who said stop is the failure this file exists to prevent.
    recorded.upsertError = { code: '57014', message: 'statement timeout' }
    const response = await POST(post({ From: '+972501234567', Body: 'הסר', MessageSid: 'SM4' }))
    expect(response.status).toBe(500)
  })

  it('resumes on הצטרף without deleting the history', async () => {
    const response = await POST(post({ From: '+972501234567', Body: 'הצטרף', MessageSid: 'SM5' }))
    expect(response.status).toBe(200)
    expect(recorded.updates[0]?.table).toBe('sms_opt_outs')
    expect(recorded.updates[0]?.values).toHaveProperty('resumed_at')
    expect(await response.text()).toContain('חזרתם')
  })

  it('says nothing to an ordinary message rather than promising an answer', async () => {
    // SMS is not a support channel here and nothing is watching it. An
    // auto-reply would promise a reply nobody will send.
    const response = await POST(
      post({ From: '+972501234567', Body: 'היי, מתי ההזמנה מגיעה?', MessageSid: 'SM6' }),
    )
    expect(response.status).toBe(200)
    expect(recorded.upserts).toEqual([])
    expect(await response.text()).not.toContain('<Message>')
  })

  it('acknowledges a signed message from a number it cannot use', async () => {
    // Acknowledged so Twilio stops retrying; there is nothing to act on.
    const response = await POST(post({ From: '+14155238886', Body: 'STOP', MessageSid: 'SM7' }))
    expect(response.status).toBe(200)
    expect(recorded.upserts).toEqual([])
  })
})
