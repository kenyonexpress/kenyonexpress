import { createHmac } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Phone verification codes. The properties that matter: the code itself is
 * never stored (only an HMAC), the challenge is written BEFORE the SMS goes
 * out and removed when it does not, five wrong guesses burn it, and a
 * verified code is single-use.
 */

const sendTransactionalSms = vi.fn()
const cacheGet = vi.fn()
const cacheSet = vi.fn()
const cacheDel = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/sms/send', () => ({
  sendTransactionalSms: (...a: unknown[]) => sendTransactionalSms(...a),
}))
vi.mock('@/lib/cache/redis', () => ({
  get: (...a: unknown[]) => cacheGet(...a),
  set: (...a: unknown[]) => cacheSet(...a),
  del: (...a: unknown[]) => cacheDel(...a),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
  challengeKey,
  generateOtpCode,
  hashOtp,
  issuePhoneOtp,
  maskE164,
  memoryOtpStore,
  otpSecret,
  verifyPhoneOtp,
} = await import('./otp')

const ENV = {
  SMS_ENABLED: 'true',
  TWILIO_ACCOUNT_SID: 'AC123',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_SMS_FROM: 'KenyonExp',
  OTP_SECRET: 'otp-secret-for-tests',
  UPSTASH_REDIS_REST_URL: 'https://r.upstash.test',
  UPSTASH_REDIS_REST_TOKEN: 'upstash-token',
} as unknown as NodeJS.ProcessEnv

const admin = {} as SupabaseClient
const PHONE = '050-123-4567'
const E164 = '+972501234567'
const USER = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  sendTransactionalSms.mockReset()
  sendTransactionalSms.mockResolvedValue({ outcome: 'sent', sid: 'SM1', segments: 1 })
  cacheGet.mockReset()
  cacheSet.mockReset()
  cacheDel.mockReset()
  logWarn.mockReset()
})

describe('primitives', () => {
  it('generateOtpCode is exactly six digits with leading zeros kept', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateOtpCode()).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`))
    }
  })

  it('otpSecret prefers OTP_SECRET, derives from CRON_SECRET, and is null with neither', () => {
    expect(otpSecret({ OTP_SECRET: ' s ' } as unknown as NodeJS.ProcessEnv)).toBe('s')
    expect(otpSecret({ OTP_SECRET: ' ', CRON_SECRET: 'c' } as unknown as NodeJS.ProcessEnv)).toBe(
      'otp:c',
    )
    expect(otpSecret({} as unknown as NodeJS.ProcessEnv)).toBeNull()
  })

  it('reads process.env by default', () => {
    vi.stubEnv('OTP_SECRET', 'from-process')
    try {
      expect(otpSecret()).toBe('from-process')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('hashOtp is an HMAC over phone and code, keyed by the secret', () => {
    const expected = createHmac('sha256', 'k').update(`${E164}\n123456`).digest('base64url')
    expect(hashOtp('123456', E164, 'k')).toBe(expected)
    expect(hashOtp('123456', '+972501234568', 'k')).not.toBe(expected)
    expect(hashOtp('123456', E164, 'other')).not.toBe(expected)
  })

  it('challengeKey and maskE164', () => {
    expect(challengeKey(E164, 'phone_verify')).toBe(`otp:phone_verify:${E164}`)
    expect(maskE164(E164)).toBe('+9725*****567')
    expect(maskE164('+9725')).toBe('+9725')
  })

  it('memoryOtpStore is a working store for tests', async () => {
    const store = memoryOtpStore()
    const challenge = {
      hash: 'h',
      attempts: 0,
      expiresAt: 1,
      purpose: 'phone_verify' as const,
      userId: null,
    }
    expect(await store.get('k')).toBeNull()
    expect(await store.set('k', challenge, 60)).toBe(true)
    expect(store.size()).toBe(1)
    expect(await store.get('k')).toEqual(challenge)
    expect(await store.del('k')).toBe(true)
    expect(await store.del('k')).toBe(false)
  })
})

describe('issuePhoneOtp', () => {
  it('refuses a number that is not an Israeli mobile before anything else', async () => {
    const store = memoryOtpStore()
    expect(
      await issuePhoneOtp(admin, { phone: '03-1234567', userId: USER, env: ENV, store }),
    ).toEqual({
      ok: false,
      reason: 'bad_phone',
    })
    expect(store.size()).toBe(0)
    expect(sendTransactionalSms).not.toHaveBeenCalled()
  })

  it('refuses when SMS is off or unconfigured', async () => {
    const store = memoryOtpStore()
    const result = await issuePhoneOtp(admin, {
      phone: PHONE,
      userId: USER,
      env: { ...ENV, SMS_ENABLED: 'false' } as NodeJS.ProcessEnv,
      store,
    })
    expect(result).toMatchObject({ ok: false, reason: 'sms_unavailable' })
    expect(store.size()).toBe(0)
  })

  it('refuses without a secret, and without a store when Upstash is unset', async () => {
    const noSecret = { ...ENV, OTP_SECRET: undefined } as NodeJS.ProcessEnv
    expect(
      await issuePhoneOtp(admin, {
        phone: PHONE,
        userId: USER,
        env: noSecret,
        store: memoryOtpStore(),
      }),
    ).toEqual({ ok: false, reason: 'store_unavailable', detail: 'no OTP_SECRET or CRON_SECRET' })

    const noUpstash = { ...ENV, UPSTASH_REDIS_REST_URL: undefined } as NodeJS.ProcessEnv
    expect(await issuePhoneOtp(admin, { phone: PHONE, userId: USER, env: noUpstash })).toEqual({
      ok: false,
      reason: 'store_unavailable',
      detail: 'Upstash is not configured',
    })
    expect(sendTransactionalSms).not.toHaveBeenCalled()
  })

  it('stores the HMAC (never the code) before sending, and sends through the transactional path', async () => {
    const store = memoryOtpStore()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T10:00:00.000Z'))
    try {
      const result = await issuePhoneOtp(admin, {
        phone: PHONE,
        userId: USER,
        env: ENV,
        store,
        code: '048213',
      })

      expect(result).toEqual({
        ok: true,
        expiresAt: '2026-09-17T10:10:00.000Z',
        to: E164,
        segments: 1,
      })
      const stored = await store.get(challengeKey(E164, 'phone_verify'))
      expect(stored).toEqual({
        hash: hashOtp('048213', E164, 'otp-secret-for-tests'),
        attempts: 0,
        expiresAt: Date.now() + OTP_TTL_SECONDS * 1000,
        purpose: 'phone_verify',
        userId: USER,
      })
      expect(JSON.stringify(stored)).not.toContain('048213')
      expect(sendTransactionalSms).toHaveBeenCalledWith(admin, {
        kind: 'otp',
        payload: { code: '048213' },
        phone: E164,
        userId: USER,
        env: ENV,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('generates a code when none is injected', async () => {
    const store = memoryOtpStore()
    const result = await issuePhoneOtp(admin, { phone: PHONE, userId: null, env: ENV, store })
    expect(result.ok).toBe(true)
    const sent = sendTransactionalSms.mock.calls[0]?.[1] as { payload: { code: string } }
    expect(sent.payload.code).toMatch(/^\d{6}$/)
  })

  it('reports a failed challenge write without sending', async () => {
    const store = { ...memoryOtpStore(), set: async () => false }
    expect(await issuePhoneOtp(admin, { phone: PHONE, userId: USER, env: ENV, store })).toEqual({
      ok: false,
      reason: 'store_unavailable',
      detail: 'challenge write failed',
    })
    expect(sendTransactionalSms).not.toHaveBeenCalled()
  })

  it('removes the challenge when the SMS was skipped, and reports it as unavailable', async () => {
    const store = memoryOtpStore()
    sendTransactionalSms.mockResolvedValue({
      outcome: 'skipped',
      reason: 'this number asked us to stop',
    })
    expect(await issuePhoneOtp(admin, { phone: PHONE, userId: USER, env: ENV, store })).toEqual({
      ok: false,
      reason: 'sms_unavailable',
      detail: 'this number asked us to stop',
    })
    expect(store.size()).toBe(0)
    expect(logWarn).toHaveBeenCalledWith('sms.otp_issue_failed', {
      reason: 'this number asked us to stop',
      outcome: 'skipped',
    })
  })

  it('removes the challenge when the SMS failed, and reports send_failed', async () => {
    const store = memoryOtpStore()
    sendTransactionalSms.mockResolvedValue({ outcome: 'failed', reason: 'twilio 500' })
    expect(await issuePhoneOtp(admin, { phone: PHONE, userId: USER, env: ENV, store })).toEqual({
      ok: false,
      reason: 'send_failed',
      detail: 'twilio 500',
    })
    expect(store.size()).toBe(0)
  })

  it('uses the Redis cache as the store when Upstash is configured and none is injected', async () => {
    cacheSet.mockResolvedValue(true)
    const result = await issuePhoneOtp(admin, {
      phone: PHONE,
      userId: USER,
      env: ENV,
      code: '111111',
    })
    expect(result.ok).toBe(true)
    expect(cacheSet).toHaveBeenCalledWith(
      challengeKey(E164, 'phone_verify'),
      expect.objectContaining({ attempts: 0, userId: USER }),
      OTP_TTL_SECONDS,
    )
  })
})

describe('verifyPhoneOtp', () => {
  const NOW = 1_800_000_000_000

  async function issued(code = '048213', attempts = 0) {
    const store = memoryOtpStore()
    await store.set(
      challengeKey(E164, 'phone_verify'),
      {
        hash: hashOtp(code, E164, 'otp-secret-for-tests'),
        attempts,
        expiresAt: NOW + 60_000,
        purpose: 'phone_verify',
        userId: USER,
      },
      60,
    )
    return store
  }

  it('is unavailable for a bad phone, a missing secret or a missing store', async () => {
    const store = await issued()
    expect(await verifyPhoneOtp({ phone: 'nope', code: '048213', env: ENV, store })).toEqual({
      result: 'unavailable',
      userId: null,
    })
    expect(
      await verifyPhoneOtp({
        phone: PHONE,
        code: '048213',
        env: { ...ENV, OTP_SECRET: undefined } as NodeJS.ProcessEnv,
        store,
      }),
    ).toEqual({ result: 'unavailable', userId: null })
    expect(
      await verifyPhoneOtp({
        phone: PHONE,
        code: '048213',
        env: { ...ENV, UPSTASH_REDIS_REST_TOKEN: '' } as NodeJS.ProcessEnv,
      }),
    ).toEqual({ result: 'unavailable', userId: null })
    // The challenge is untouched by any of those.
    expect(store.size()).toBe(1)
  })

  it('reports expired with no challenge, and deletes one whose instant has passed', async () => {
    const empty = memoryOtpStore()
    expect(await verifyPhoneOtp({ phone: PHONE, code: '048213', env: ENV, store: empty })).toEqual({
      result: 'expired',
      userId: null,
    })

    const store = await issued()
    expect(
      await verifyPhoneOtp({ phone: PHONE, code: '048213', env: ENV, store, nowMs: NOW + 60_000 }),
    ).toEqual({ result: 'expired', userId: USER })
    expect(store.size()).toBe(0)
  })

  it('accepts the right code once, stripping formatting, and burns the challenge', async () => {
    const store = await issued()
    expect(
      await verifyPhoneOtp({ phone: PHONE, code: ' 048-213 ', env: ENV, store, nowMs: NOW }),
    ).toEqual({ result: 'ok', userId: USER })
    expect(store.size()).toBe(0)
    expect(
      await verifyPhoneOtp({ phone: PHONE, code: '048213', env: ENV, store, nowMs: NOW }),
    ).toEqual({ result: 'expired', userId: null })
  })

  it('counts a wrong guess against the challenge and keeps its remaining ttl', async () => {
    const store = await issued()
    const setSpy = vi.spyOn(store, 'set')
    expect(
      await verifyPhoneOtp({ phone: PHONE, code: '000000', env: ENV, store, nowMs: NOW + 30_500 }),
    ).toEqual({ result: 'wrong', userId: USER })
    expect(setSpy).toHaveBeenCalledWith(
      challengeKey(E164, 'phone_verify'),
      expect.objectContaining({ attempts: 1 }),
      30,
    )
    // A right code of the wrong length is also wrong.
    expect(
      await verifyPhoneOtp({ phone: PHONE, code: '48213', env: ENV, store, nowMs: NOW }),
    ).toEqual({ result: 'wrong', userId: USER })
    expect((await store.get(challengeKey(E164, 'phone_verify')))?.attempts).toBe(2)
  })

  it('locks on the fifth wrong guess and on any guess after that', async () => {
    const fifth = await issued('048213', OTP_MAX_ATTEMPTS - 1)
    expect(
      await verifyPhoneOtp({ phone: PHONE, code: '000000', env: ENV, store: fifth, nowMs: NOW }),
    ).toEqual({ result: 'locked', userId: USER })
    expect(fifth.size()).toBe(0)

    // Even the RIGHT code is refused once the counter is spent.
    const spent = await issued('048213', OTP_MAX_ATTEMPTS)
    expect(
      await verifyPhoneOtp({ phone: PHONE, code: '048213', env: ENV, store: spent, nowMs: NOW }),
    ).toEqual({ result: 'locked', userId: USER })
    expect(spent.size()).toBe(0)
  })

  it('reads the challenge from the Redis cache by default', async () => {
    cacheGet.mockResolvedValue(null)
    expect(await verifyPhoneOtp({ phone: PHONE, code: '048213', env: ENV })).toEqual({
      result: 'expired',
      userId: null,
    })
    expect(cacheGet).toHaveBeenCalledWith(challengeKey(E164, 'phone_verify'))
  })
})
