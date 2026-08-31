import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The one property this action exists to hold: THE UUID COMES FROM THE SESSION.
 *
 * `fn_ensure_referral_code(p_user_id uuid)` is SECURITY DEFINER and never reads
 * `auth.uid()`. 098 revoked it from PUBLIC and anon and NOT from
 * `authenticated`, so for as long as that grant stands, any signed-in customer
 * holding somebody else's uuid can read (and mint) that person's referral code
 * straight off `/rest/v1/rpc/`. `migrations/pending/143` carries the REVOKE and
 * is waiting on approval.
 *
 * That makes the shape of this action the mitigation and not a detail: it takes
 * no argument, so there is no way to name a victim, and it runs on the service
 * key, so applying 143 does not break it. The assertions below are on both of
 * those and not on the returned string. A refactor that "helpfully" adds a
 * userId parameter has to delete a test with a reason attached to it.
 */

const rpc = vi.fn()
const getUser = vi.fn()
const adminClient = vi.fn(() => ({ rpc }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))

const checkRateLimit = vi.fn(async () => true)
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...(args as [])),
}))

vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => Promise<unknown>) => fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/observability/log', () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { ensureMyReferralCode } from './referrals'

const USER = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: 'AB12CD34', error: null })
  getUser.mockReset().mockResolvedValue({ data: { user: { id: USER } } })
  adminClient.mockClear()
  checkRateLimit.mockReset().mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ensureMyReferralCode', () => {
  it('takes no argument at all, so a caller cannot name a target', () => {
    expect(ensureMyReferralCode.length).toBe(0)
  })

  it('passes the session uuid and nothing else to the definer function', async () => {
    await ensureMyReferralCode()
    expect(rpc).toHaveBeenCalledWith('fn_ensure_referral_code', { p_user_id: USER })
  })

  it('runs on the service-role client, which is what migration 143 leaves granted', async () => {
    await ensureMyReferralCode()
    expect(adminClient).toHaveBeenCalledTimes(1)
  })

  it('refuses without a session, before touching the database', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const result = await ensureMyReferralCode()
    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('is rate limited on the user, not on the address', async () => {
    await ensureMyReferralCode()
    expect(checkRateLimit).toHaveBeenCalledWith(`referral-code:${USER}`, 10, 3600)
  })

  it('does not call the RPC once the limit is reached', async () => {
    checkRateLimit.mockResolvedValue(false)
    const result = await ensureMyReferralCode()
    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns the minted code', async () => {
    await expect(ensureMyReferralCode()).resolves.toEqual({ ok: true, code: 'AB12CD34' })
  })

  it('refuses a code that is not in the 098 alphabet rather than shipping a dead link', async () => {
    // A share link built on an unusable code is answered `unknown_code` for the
    // rest of its life, and nothing tells the person who shared it.
    rpc.mockResolvedValue({ data: 'nope', error: null })
    const result = await ensureMyReferralCode()
    expect(result.ok).toBe(false)
  })

  it('reports a failure instead of throwing into the page', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for function' } })
    const result = await ensureMyReferralCode()
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
