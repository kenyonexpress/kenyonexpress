import { describe, expect, it, vi } from 'vitest'

/**
 * The automatic payer, tested on the four things that decide whether a referral
 * bonus lands and whether anyone hears about it.
 *
 * The one that earns its place is `already_paid`: `fn_pay_referral` returns
 * `{ ok: true }` for it, so a test that only checks `ok` would pass while the
 * replayed webhook mailed both people a second time about money that moved
 * once.
 */

const rpc = vi.fn()
const profileRows = vi.fn()

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

const { payReferralIfReady, referralNotificationKey, REFERRAL_BONUS_KIND } = await import('./pay')

const REFERRAL = '33333333-3333-4333-8333-333333333333'
const REFERRER = '11111111-1111-4111-8111-111111111111'
const REFERRED = '22222222-2222-4222-8222-222222222222'

function referralRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REFERRAL,
    referrer_user_id: REFERRER,
    referred_user_id: REFERRED,
    referrer_bonus_agorot: 2000,
    referred_bonus_agorot: 1000,
    ...overrides,
  }
}

/** The slice of the client this path touches: one rpc, two table reads. */
function client(row: Record<string, unknown> | null = referralRow()) {
  return {
    rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
        in: () => Promise.resolve(profileRows(table)),
      }),
    }),
  } as never
}

function reset() {
  rpc.mockReset()
  profileRows.mockReset()
  logWarn.mockReset()
  logInfo.mockReset()
  profileRows.mockReturnValue({
    data: [
      { id: REFERRER, email: 'referrer@example.test' },
      { id: REFERRED, email: 'referred@example.test' },
    ],
    error: null,
  })
}

/** Every rpc call that enqueued a notification. */
function enqueues() {
  return rpc.mock.calls
    .filter((call) => call[0] === 'fn_enqueue_notification')
    .map((call) => call[1] as Record<string, unknown>)
}

describe('payReferralIfReady', () => {
  it('pays with no approver, so no person is named on a decision they did not make', async () => {
    reset()
    rpc.mockResolvedValueOnce({ data: { ok: true, reason: 'paid' }, error: null })
    rpc.mockResolvedValue({ data: null, error: null })

    await payReferralIfReady(client(), REFERRAL)

    expect(rpc.mock.calls[0]?.[0]).toBe('fn_pay_referral')
    expect(rpc.mock.calls[0]?.[1]).toEqual({ p_referral_id: REFERRAL, p_approved_by: null })
  })

  it('mails both sides once each, keyed so a replay adds nothing', async () => {
    reset()
    rpc.mockResolvedValueOnce({ data: { ok: true, reason: 'paid' }, error: null })
    rpc.mockResolvedValue({ data: null, error: null })

    await payReferralIfReady(client(), REFERRAL)

    const sent = enqueues()
    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({
      p_kind: REFERRAL_BONUS_KIND,
      p_email: 'referrer@example.test',
      p_dedupe: referralNotificationKey(REFERRAL, 'referrer'),
      p_payload: { amount_agorot: 2000, role: 'referrer' },
    })
    expect(sent[1]).toMatchObject({
      p_email: 'referred@example.test',
      p_dedupe: referralNotificationKey(REFERRAL, 'referred'),
      p_payload: { amount_agorot: 1000, role: 'referred' },
    })
  })

  it('sends NOTHING on already_paid, even though it is an ok result', async () => {
    reset()
    rpc.mockResolvedValueOnce({ data: { ok: true, reason: 'already_paid' }, error: null })

    await payReferralIfReady(client(), REFERRAL)

    expect(enqueues()).toHaveLength(0)
  })

  it('sends nothing when the payer refuses', async () => {
    reset()
    rpc.mockResolvedValueOnce({ data: { ok: false, reason: 'no_referrer_wallet' }, error: null })

    await payReferralIfReady(client(), REFERRAL)

    expect(enqueues()).toHaveLength(0)
    expect(logWarn).toHaveBeenCalledWith(
      'referrals.pay_refused',
      expect.objectContaining({ reason: 'no_referrer_wallet' }),
    )
  })

  it('does not throw when the rpc itself fails: the card is already charged', async () => {
    reset()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'deadlock detected' } })

    await expect(payReferralIfReady(client(), REFERRAL)).resolves.toBeUndefined()
    expect(enqueues()).toHaveLength(0)
  })

  it('skips a side whose bonus is zero, because no money moved for it', async () => {
    reset()
    rpc.mockResolvedValueOnce({ data: { ok: true, reason: 'paid' }, error: null })
    rpc.mockResolvedValue({ data: null, error: null })

    await payReferralIfReady(client(referralRow({ referred_bonus_agorot: 0 })), REFERRAL)

    const sent = enqueues()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ p_payload: { role: 'referrer' } })
  })

  it('carries on when the kind is not in the constraint yet, and names that', async () => {
    reset()
    rpc.mockResolvedValueOnce({ data: { ok: true, reason: 'paid' }, error: null })
    rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'check violation' } })

    await expect(payReferralIfReady(client(), REFERRAL)).resolves.toBeUndefined()
    expect(logWarn).toHaveBeenCalledWith(
      'referrals.notify_enqueue_failed',
      expect.objectContaining({ kind_not_accepted: true }),
    )
  })

  it('names a missing email rather than silently dropping one side', async () => {
    reset()
    rpc.mockResolvedValueOnce({ data: { ok: true, reason: 'paid' }, error: null })
    rpc.mockResolvedValue({ data: null, error: null })
    profileRows.mockReturnValue({
      data: [{ id: REFERRER, email: 'referrer@example.test' }],
      error: null,
    })

    await payReferralIfReady(client(), REFERRAL)

    expect(enqueues()).toHaveLength(1)
    expect(logWarn).toHaveBeenCalledWith(
      'referrals.notify_no_email',
      expect.objectContaining({ role: 'referred' }),
    )
  })
})

describe('referralNotificationKey', () => {
  it('differs by side, so one side cannot swallow the other', () => {
    expect(referralNotificationKey(REFERRAL, 'referrer')).not.toBe(
      referralNotificationKey(REFERRAL, 'referred'),
    )
  })
})
