import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The programme terms, tested for the state production is actually in.
 *
 * `referral_program_settings` holds ZERO rows on the hosted project, measured
 * on 2026-08-31, because 098 deliberately seeds none: nobody is going to guess
 * what a bonus is worth. Every other test here would pass with a reader that
 * collapses "no row" into a zeroed programme, and that reader would put
 * "get a bonus of 0.00" in front of a customer and hand out share links that
 * `fn_claim_referral` answers `program_inactive` to. So the absent row is the
 * first case, not the last.
 */

const maybeSingle = vi.fn()
const select = vi.fn(() => ({ maybeSingle }))
const from = vi.fn(() => ({ select }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from }),
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

import { getReferralProgram } from './program'

const ACTIVE_ROW = {
  referrer_bonus_agorot: 2500,
  referred_bonus_agorot: 1500,
  min_order_agorot: 10000,
  qualify_window_days: 30,
  require_manual_approval: false,
  is_active: true,
}

beforeEach(() => {
  maybeSingle.mockReset()
  from.mockClear()
  select.mockClear()
  logWarn.mockReset()
  logInfo.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getReferralProgram', () => {
  it('returns null when the owner has not set what the programme pays', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(getReferralProgram()).resolves.toBeNull()
    expect(logInfo).toHaveBeenCalled()
  })

  it('returns null when the row exists but the programme is switched off', async () => {
    maybeSingle.mockResolvedValue({ data: { ...ACTIVE_ROW, is_active: false }, error: null })
    await expect(getReferralProgram()).resolves.toBeNull()
  })

  it('returns null rather than throwing when the table will not answer', async () => {
    // The referrals page also renders the customer's own rows, which come from
    // a different read. One unavailable table should not take the screen down.
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    await expect(getReferralProgram()).resolves.toBeNull()
    expect(logWarn).toHaveBeenCalled()
  })

  it('reads the agorot columns as integer agorot, unscaled', async () => {
    maybeSingle.mockResolvedValue({ data: ACTIVE_ROW, error: null })
    const program = await getReferralProgram()
    expect(program).toEqual({
      referrerBonus: 2500,
      referredBonus: 1500,
      minOrder: 10000,
      qualifyWindowDays: 30,
      requiresManualApproval: false,
    })
  })

  it('carries the manual-approval flag through, because the page says so', async () => {
    maybeSingle.mockResolvedValue({
      data: { ...ACTIVE_ROW, require_manual_approval: true },
      error: null,
    })
    await expect(getReferralProgram()).resolves.toMatchObject({ requiresManualApproval: true })
  })

  it('reads the settings on the service key, which is the only role RLS allows', async () => {
    // `referral_settings_admin_read` is gated on is_admin(). A shopper's own
    // client gets an empty set rather than an error, which would render as a
    // programme that pays nothing.
    maybeSingle.mockResolvedValue({ data: ACTIVE_ROW, error: null })
    await getReferralProgram()
    expect(from).toHaveBeenCalledWith('referral_program_settings')
  })
})
