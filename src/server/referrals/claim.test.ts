import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The claim, tested for the three things that can only be got wrong once.
 *
 *  1. It never runs the RPC on a code that could not exist, so a `?ref=`
 *     carrying a payload is not forwarded to the database.
 *  2. It never lets a sign-in fail. Every caller is between an exchanged auth
 *     code and a redirect.
 *  3. It keeps the cookie when the answer is UNKNOWN and drops it when the
 *     answer is SETTLED. Getting that backwards either loses a referral on one
 *     database hiccup, or retries a settled claim on every future login.
 */

const rpc = vi.fn()
const cookieGet = vi.fn()
const cookieDelete = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc }),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet, delete: cookieDelete }),
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }),
}))

const logWarn = vi.fn()
const logInfo = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: {
    warn: (...args: unknown[]) => logWarn(...args),
    info: (...args: unknown[]) => logInfo(...args),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { claimReferralOnce } from './claim'

const USER = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  rpc.mockReset()
  cookieGet.mockReset()
  cookieDelete.mockReset()
  logWarn.mockReset()
  logInfo.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('claimReferralOnce', () => {
  it('does nothing at all without a referral cookie', async () => {
    cookieGet.mockReturnValue(undefined)
    await claimReferralOnce(USER, 'device-1')
    expect(rpc).not.toHaveBeenCalled()
    expect(cookieDelete).not.toHaveBeenCalled()
  })

  it('refuses to forward a value that is not a code', async () => {
    cookieGet.mockReturnValue({ value: "'; drop table referrals; --" })
    await claimReferralOnce(USER, 'device-1')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends the code upper-cased, with hashed signals and never a raw value', async () => {
    cookieGet.mockReturnValue({ value: 'ab12cd34' })
    rpc.mockResolvedValue({ data: { ok: true }, error: null })

    await claimReferralOnce(USER, 'device-1')

    expect(rpc).toHaveBeenCalledTimes(1)
    const args = rpc.mock.calls[0]?.[1] as Record<string, string | null>
    expect(rpc.mock.calls[0]?.[0]).toBe('fn_claim_referral')
    expect(args.p_code).toBe('AB12CD34')
    expect(args.p_referred_user_id).toBe(USER)

    // 64 hex characters, and NOT the input. The point of the assertion is the
    // second half: `referral_signals` must never receive a raw address or a
    // raw session id, because a future admin screen selecting that column
    // would put it on a page.
    expect(args.p_device_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(args.p_device_hash).not.toContain('device-1')
    expect(args.p_ip_hash).not.toContain('203.0.113.5')
    expect(args.p_device_hash).not.toBe(args.p_ip_hash)
  })

  it('takes the leftmost forwarded hop as the IP, like every other reader here', async () => {
    cookieGet.mockReturnValue({ value: 'AB12CD34' })
    rpc.mockResolvedValue({ data: { ok: true }, error: null })
    await claimReferralOnce(USER, null)
    const first = (rpc.mock.calls[0]?.[1] as Record<string, string>).p_ip_hash

    rpc.mockClear()
    await claimReferralOnce(USER, null)
    expect((rpc.mock.calls[0]?.[1] as Record<string, string>).p_ip_hash).toBe(first)
  })

  it('sends a null device hash rather than inventing a weaker one', async () => {
    cookieGet.mockReturnValue({ value: 'AB12CD34' })
    rpc.mockResolvedValue({ data: { ok: true }, error: null })
    await claimReferralOnce(USER, null)
    expect((rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_device_hash).toBeNull()
  })

  it('clears the cookie once the claim succeeds', async () => {
    cookieGet.mockReturnValue({ value: 'AB12CD34' })
    rpc.mockResolvedValue({ data: { ok: true }, error: null })
    await claimReferralOnce(USER, 'device-1')
    expect(cookieDelete).toHaveBeenCalledTimes(1)
  })

  it.each(['program_inactive', 'unknown_code', 'self_referral', 'already_referred'])(
    'clears the cookie on a settled refusal (%s), which retrying cannot change',
    async (reason) => {
      cookieGet.mockReturnValue({ value: 'AB12CD34' })
      rpc.mockResolvedValue({ data: { ok: false, reason }, error: null })
      await claimReferralOnce(USER, 'device-1')
      expect(cookieDelete).toHaveBeenCalledTimes(1)
    },
  )

  it('KEEPS the cookie when the database did not answer', async () => {
    // The whole reason the two branches are separate. A code thrown away here
    // is a referral nobody can reconstruct; a code kept costs one more attempt
    // at the next sign-in.
    cookieGet.mockReturnValue({ value: 'AB12CD34' })
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    await claimReferralOnce(USER, 'device-1')
    expect(cookieDelete).not.toHaveBeenCalled()
    expect(logWarn).toHaveBeenCalled()
  })

  it('never throws, whatever the client does', async () => {
    cookieGet.mockReturnValue({ value: 'AB12CD34' })
    rpc.mockRejectedValue(new Error('service key missing'))
    await expect(claimReferralOnce(USER, 'device-1')).resolves.toBeUndefined()
    expect(logWarn).toHaveBeenCalled()
  })
})
