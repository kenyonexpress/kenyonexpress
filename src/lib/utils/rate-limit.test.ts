import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The rate limiter, tested for WHICH ROLE IT RUNS AS.
 *
 * The behaviour under test is not "does it count". It is that these two
 * functions never touch the cookie-bound client again. While they did, the RPC
 * executed as `anon`/`authenticated`, so `check_rate_limit` had to be granted
 * EXECUTE to those roles - and since the publishable key is public, anyone
 * could POST `/rest/v1/rpc/check_rate_limit` with a key of their choosing and
 * burn a real user's budget. `p_key` is caller-supplied and the counter
 * increments before the limit is compared, so `phone-otp-number:<victim>` five
 * times locks that person out of logging in for the hour.
 *
 * `migrations/pending/127_revoke_check_rate_limit_execute.sql` removes that
 * grant. It can only be applied while this file passes, which is why the
 * assertion is on the import and not on a returned number: a future edit that
 * "simplifies" this back to `createClient()` is a silent re-open of the hole
 * AND, once 127 is applied, a silent switch-off of every limit in the app,
 * because both functions fail open.
 */

const rpc = vi.fn()
const createAdminClient = vi.fn(() => ({ rpc }))
const serverCreateClient = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClient(),
}))

// Deliberately importable and deliberately never called. If it is, the test
// below fails with the name of the thing that regressed rather than a count.
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => serverCreateClient(),
}))

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...args: unknown[]) => logError(...args) },
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.5' }),
}))

import { checkRateLimit, checkUserRateLimit, getClientIp } from './rate-limit'

beforeEach(() => {
  rpc.mockReset()
  createAdminClient.mockReset().mockReturnValue({ rpc })
  serverCreateClient.mockReset()
  logError.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('checkRateLimit', () => {
  it('runs the RPC on the service-role client, never the caller session', async () => {
    rpc.mockResolvedValue({ data: true, error: null })

    await checkRateLimit('login:203.0.113.5')

    expect(createAdminClient).toHaveBeenCalledTimes(1)
    expect(serverCreateClient).not.toHaveBeenCalled()
  })

  it('passes the key and the limit through unchanged', async () => {
    rpc.mockResolvedValue({ data: true, error: null })

    await checkRateLimit('phone-otp-number:+972500000000', 5, 3600)

    expect(rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'phone-otp-number:+972500000000',
      p_max_attempts: 5,
      p_window_seconds: 3600,
    })
  })

  it('refuses when the function says the budget is spent', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    expect(await checkRateLimit('login:203.0.113.5')).toBe(false)
  })

  it('fails open when the RPC errors, and says so', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    expect(await checkRateLimit('login:203.0.113.5')).toBe(true)
    expect(logError).toHaveBeenCalledWith('rate_limit.check_failed', {
      reason: 'permission denied',
    })
  })

  it('fails open when the service key is absent, and names that separately', async () => {
    // A missing key and a refused RPC both fail open, but they are different
    // faults with different fixes, so they must not share a log line.
    createAdminClient.mockImplementation(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
    })

    expect(await checkRateLimit('login:203.0.113.5')).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
    expect(logError).toHaveBeenCalledWith('rate_limit.admin_client_unavailable', {
      reason: 'SUPABASE_SERVICE_ROLE_KEY is not set',
    })
  })
})

describe('checkUserRateLimit', () => {
  /**
   * This one had zero callers and, on the old client, could not have worked:
   * `check_user_rate_limit` is granted to `service_role` only, so every call
   * would have been 42501 and every call would have failed open.
   */
  it('runs on the service-role client too', async () => {
    rpc.mockResolvedValue({ data: true, error: null })

    await checkUserRateLimit('11111111-1111-1111-1111-111111111111', 'checkout', 10, 60)

    expect(createAdminClient).toHaveBeenCalledTimes(1)
    expect(serverCreateClient).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('check_user_rate_limit', {
      p_user_id: '11111111-1111-1111-1111-111111111111',
      p_action: 'checkout',
      p_limit: 10,
      p_window_seconds: 60,
    })
  })

  it('fails open on an RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    expect(await checkUserRateLimit('u', 'checkout')).toBe(true)
  })
})

describe('getClientIp', () => {
  it('takes the first hop of x-forwarded-for', async () => {
    expect(await getClientIp()).toBe('203.0.113.5')
  })
})
