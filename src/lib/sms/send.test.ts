import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendTransactionalSms } from './send'

/**
 * The order of the checks, and the one place in this stack that fails CLOSED.
 *
 * Everywhere else an unreadable preference table means "no opinion recorded"
 * and the message goes. Here an unreadable OPT-OUT table means the message does
 * not go. Sending to somebody who asked us to stop is a matter under
 * תיקון 40 and a complaint to the carrier that can cost the sender ID; failing
 * to send is a message that arrives by email instead.
 */

const ENV = {
  SMS_ENABLED: 'true',
  TWILIO_ACCOUNT_SID: 'AC123',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_SMS_FROM: 'KenyonExp',
} as unknown as NodeJS.ProcessEnv

interface State {
  optedOut: boolean
  optOutError?: { code?: string; message: string }
  logged: Record<string, unknown>[]
}

function fakeAdmin(state: State): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: async () =>
              state.optOutError
                ? { data: null, error: state.optOutError }
                : { data: state.optedOut ? { to_e164: '+972501234567' } : null, error: null },
          }),
        }),
      }),
      insert: async (values: Record<string, unknown>) => {
        if (table === 'sms_messages') state.logged.push(values)
        return { error: null }
      },
    }),
  } as unknown as SupabaseClient
}

function twilioAccepting() {
  return vi.fn(async () => ({
    ok: true,
    status: 201,
    json: async () => ({ sid: 'SM1', num_segments: '2' }),
    text: async () => '',
  })) as unknown as typeof fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the free checks, before anything costs a query or a message', () => {
  it('sends nothing while the flag is off, and reads no table', async () => {
    const state: State = { optedOut: false, logged: [] }
    const fetchMock = twilioAccepting()
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendTransactionalSms(fakeAdmin(state), {
      kind: 'otp',
      payload: { code: '482913' },
      phone: '0501234567',
      env: { ...ENV, SMS_ENABLED: 'false' } as unknown as NodeJS.ProcessEnv,
    })

    expect(result).toMatchObject({ outcome: 'skipped' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(state.logged).toEqual([])
  })

  it('refuses a landline before it can be billed', async () => {
    // Twilio ACCEPTS and BILLS an SMS to an Israeli landline and delivers it
    // nowhere. This refusal saves real money on every attempt.
    const state: State = { optedOut: false, logged: [] }
    const fetchMock = twilioAccepting()
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendTransactionalSms(fakeAdmin(state), {
      kind: 'order_shipped',
      payload: { carrier: 'דואר ישראל' },
      phone: '031234567',
      env: ENV,
    })

    expect(result).toMatchObject({ outcome: 'skipped' })
    expect(result).toMatchObject({ reason: expect.stringContaining('Israeli mobile') })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('settles a kind that owes no SMS rather than retrying it', async () => {
    const state: State = { optedOut: false, logged: [] }
    const result = await sendTransactionalSms(fakeAdmin(state), {
      kind: 'supplier_sale' as never,
      payload: {},
      phone: '0501234567',
      env: ENV,
    })
    expect(result).toMatchObject({ outcome: 'skipped' })
  })
})

describe('the opt-out gate', () => {
  it('does not message somebody who asked us to stop', async () => {
    const state: State = { optedOut: true, logged: [] }
    const fetchMock = twilioAccepting()
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendTransactionalSms(fakeAdmin(state), {
      kind: 'voucher_issued',
      payload: { code: 'ABCD-1234', product_name: 'עיסוי' },
      phone: '0501234567',
      env: ENV,
    })

    expect(result).toMatchObject({ outcome: 'skipped' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still sends the OTP they just asked for', async () => {
    // The one exemption, and it is not a loophole: suppressing it locks
    // somebody out of their own account over a STOP sent two years ago.
    const state: State = { optedOut: true, logged: [] }
    const fetchMock = twilioAccepting()
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendTransactionalSms(fakeAdmin(state), {
      kind: 'otp',
      payload: { code: '482913' },
      phone: '0501234567',
      env: ENV,
    })

    expect(result).toMatchObject({ outcome: 'sent', sid: 'SM1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('FAILS CLOSED when the opt-out list cannot be read', async () => {
    // The asymmetry with every other preference read in this codebase, and the
    // one worth stating: not knowing whether somebody opted out is not
    // permission to message them.
    const state: State = {
      optedOut: false,
      optOutError: { code: '57014', message: 'statement timeout' },
      logged: [],
    }
    const fetchMock = twilioAccepting()
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendTransactionalSms(fakeAdmin(state), {
      kind: 'voucher_issued',
      payload: { code: 'ABCD-1234' },
      phone: '0501234567',
      env: ENV,
    })

    expect(result).toMatchObject({ outcome: 'skipped' })
    expect(result).toMatchObject({ reason: expect.stringContaining('refusing to send') })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats an unapplied 216 as nobody having opted out', async () => {
    // There is no opt-out list yet because there is no SMS yet, so there is
    // nobody to have opted out. The exception to the exception.
    const state: State = {
      optedOut: false,
      optOutError: { code: '42P01', message: 'relation does not exist' },
      logged: [],
    }
    vi.stubGlobal('fetch', twilioAccepting())

    const result = await sendTransactionalSms(fakeAdmin(state), {
      kind: 'voucher_issued',
      payload: { code: 'ABCD-1234' },
      phone: '0501234567',
      env: ENV,
    })
    expect(result).toMatchObject({ outcome: 'sent' })
  })
})

describe('what lands in the log', () => {
  it('records a sent message as queued, not delivered', async () => {
    // Twilio's POST response means accepted. Recording `sent` here would make
    // the log claim every message arrived.
    const state: State = { optedOut: false, logged: [] }
    vi.stubGlobal('fetch', twilioAccepting())

    await sendTransactionalSms(fakeAdmin(state), {
      kind: 'otp',
      payload: { code: '482913' },
      phone: '0501234567',
      userId: 'user-1',
      env: ENV,
    })

    expect(state.logged).toHaveLength(1)
    expect(state.logged[0]).toMatchObject({
      provider_sid: 'SM1',
      user_id: 'user-1',
      to_e164: '+972501234567',
      kind: 'otp',
      status: 'queued',
      segments: 2,
    })
  })

  it('records a failure that never reached Twilio, with no SID', async () => {
    const state: State = { optedOut: false, logged: [] }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    )

    const result = await sendTransactionalSms(fakeAdmin(state), {
      kind: 'otp',
      payload: { code: '482913' },
      phone: '0501234567',
      env: ENV,
    })

    expect(result).toMatchObject({ outcome: 'failed' })
    expect(state.logged[0]).toMatchObject({ provider_sid: null, status: 'failed' })
  })

  it('writes nothing for a message that was never attempted', async () => {
    // A skip is not spend and must not appear in a cost report.
    const state: State = { optedOut: true, logged: [] }
    vi.stubGlobal('fetch', twilioAccepting())

    await sendTransactionalSms(fakeAdmin(state), {
      kind: 'voucher_issued',
      payload: { code: 'ABCD-1234' },
      phone: '0501234567',
      env: ENV,
    })
    expect(state.logged).toEqual([])
  })
})
