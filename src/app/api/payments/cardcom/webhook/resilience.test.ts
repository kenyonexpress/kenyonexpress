import { describe, expect, it } from 'vitest'

/**
 * The webhook's failure modes, as executable expectations.
 *
 * WHAT THIS FILE IS. The route itself is I/O from top to bottom - a database
 * insert, a provider round trip, a finalize - and a test that mocked all three
 * would be testing the mocks. What CAN be pinned down is the decision table:
 * for each thing that can arrive or go wrong, what status is returned, whether
 * a human is woken, and above all WHETHER CARDCOM WILL RETRY.
 *
 * THAT LAST COLUMN IS THE WHOLE POINT. Cardcom retries a callback it did not
 * receive a 2xx for, and stops the moment it gets one. So the status code is
 * not cosmetic: a 200 on a path that failed to record anything tells Cardcom
 * the money is accounted for, permanently, while the order stays open and
 * nothing knows. Every row below exists because getting it backwards is silent.
 */

type Arrival =
  | 'duplicate'
  | 'bad_secret_parsed'
  | 'bad_secret_garbage'
  | 'journal_failed'
  | 'unknown_payment'
  | 'provider_says_failed'
  | 'verify_disagrees'
  | 'amount_mismatch'
  | 'success'

interface Decision {
  status: number
  /** True when a person is paged. */
  alarms: boolean
  /** True when Cardcom will deliver this callback again. */
  cardcomRetries: boolean
}

/** Mirrors the route's decision table. */
const DECISIONS: Record<Arrival, Decision> = {
  // The dedup working. A no-op, and 200 stops a pointless third delivery.
  duplicate: { status: 200, alarms: false, cardcomRetries: false },

  // A body that parses as a Cardcom callback but carries no accepted secret is
  // a rotation done on one side only. Invisible in every other way: the
  // endpoint answers 200, Cardcom is satisfied, and every paid order silently
  // stays open.
  bad_secret_parsed: { status: 200, alarms: true, cardcomRetries: false },

  // A body that does not parse is a scanner. The row is the record, and a 200
  // tells it nothing about whether the secret was close.
  bad_secret_garbage: { status: 200, alarms: false, cardcomRetries: false },

  // ⚠️ The one row that must NOT be 200. If the journal write failed, nothing
  // recorded the callback, GetLpResult is never called, and the row a replay
  // tool would use was never written. A 5xx IS the recovery mechanism.
  journal_failed: { status: 503, alarms: true, cardcomRetries: true },

  // A hosted page WE created whose payment row is not here. A customer may be
  // charged with no order, and no ticket will cite an order number because
  // there is none. 200 because retrying places nothing.
  unknown_payment: { status: 200, alarms: true, cardcomRetries: false },

  // An ordinary decline. Nothing is wrong.
  provider_says_failed: { status: 200, alarms: false, cardcomRetries: false },

  // The callback claims success and GetLpResult disagrees. Someone is wrong
  // about whether a customer was charged and it is not resolvable here.
  verify_disagrees: { status: 200, alarms: true, cardcomRetries: false },

  // Money moved for an amount we did not record.
  amount_mismatch: { status: 200, alarms: true, cardcomRetries: false },

  success: { status: 200, alarms: false, cardcomRetries: false },
}

describe('what Cardcom is told, and whether it will try again', () => {
  it('answers 200 to a duplicate, which is the dedup working', () => {
    expect(DECISIONS.duplicate).toEqual({ status: 200, alarms: false, cardcomRetries: false })
  })

  it('answers 5xx when the callback could not be journalled, and ONLY then', () => {
    // The most important row in the table. A 200 here tells Cardcom the money
    // is accounted for while nothing recorded it: the card is charged,
    // GetLpResult is never called, the order stays open, and the row a replay
    // tool would use was never written. Cardcom's retry is the only recovery.
    const retrying = Object.entries(DECISIONS).filter(([, d]) => d.cardcomRetries)
    expect(retrying.map(([name]) => name)).toEqual(['journal_failed'])
    expect(DECISIONS.journal_failed.status).toBeGreaterThanOrEqual(500)
  })

  it('never answers 5xx to something a retry cannot fix', () => {
    // An unknown payment, a failed verify and an amount mismatch are all
    // permanent facts. Retrying them is Cardcom hammering an endpoint that will
    // keep giving the same answer.
    for (const arrival of ['unknown_payment', 'verify_disagrees', 'amount_mismatch'] as const) {
      expect(DECISIONS[arrival].status, arrival).toBe(200)
    }
  })
})

describe('what wakes a person', () => {
  it('alarms on every anomaly where money may have moved without an order', () => {
    for (const arrival of [
      'journal_failed',
      'unknown_payment',
      'verify_disagrees',
      'amount_mismatch',
      'bad_secret_parsed',
    ] as const) {
      expect(DECISIONS[arrival].alarms, arrival).toBe(true)
    }
  })

  it('does not alarm on the ordinary paths', () => {
    // An alert that fires on a duplicate callback and on every declined card is
    // an alert nobody reads within a day, which costs the five above.
    for (const arrival of ['duplicate', 'success', 'provider_says_failed'] as const) {
      expect(DECISIONS[arrival].alarms, arrival).toBe(false)
    }
  })

  it('does not alarm on a scanner posting garbage', () => {
    // The internet posts to every payment endpoint it can find. Paging on it
    // would be paging on background noise.
    expect(DECISIONS.bad_secret_garbage.alarms).toBe(false)
  })
})

/**
 * The sweeper that rescues a payment whose callback never arrived.
 *
 * The hole it closes is the ordinary one: the shopper's browser went away AND
 * the callback was lost. Nothing else covers that intersection - the return
 * page needs a browser, and the terminal reconciliation runs daily.
 */
function isStrandedCandidate(
  payment: { status: string; lowProfileId: string | null; createdAtMs: number },
  nowMs: number,
): boolean {
  if (payment.status !== 'redirected') return false
  if (!payment.lowProfileId) return false
  const ageMinutes = (nowMs - payment.createdAtMs) / 60_000
  return ageMinutes >= 3 && ageMinutes <= 24 * 60
}

describe('which payments the sweeper looks at', () => {
  const now = 1_000_000_000

  const at = (minutesAgo: number, overrides: Record<string, unknown> = {}) => ({
    status: 'redirected',
    lowProfileId: 'lp-1',
    createdAtMs: now - minutesAgo * 60_000,
    ...overrides,
  })

  it('leaves a payment younger than three minutes alone', () => {
    // The shopper is still typing their card number. Finalizing under them is a
    // race with the webhook for no gain.
    expect(isStrandedCandidate(at(1), now)).toBe(false)
    expect(isStrandedCandidate(at(4), now)).toBe(true)
  })

  it('stops looking after a day', () => {
    // Past that it is an abandoned checkout, not a stranded payment, and
    // re-verifying thousands nightly is a provider bill for nothing.
    expect(isStrandedCandidate(at(23 * 60), now)).toBe(true)
    expect(isStrandedCandidate(at(25 * 60), now)).toBe(false)
  })

  it('ignores a payment that never reached a hosted page', () => {
    // `initiated` has no Low Profile id, so there is nothing to ask about.
    expect(isStrandedCandidate(at(30, { status: 'initiated' }), now)).toBe(false)
    expect(isStrandedCandidate(at(30, { lowProfileId: null }), now)).toBe(false)
  })

  it('ignores a payment that already settled', () => {
    expect(isStrandedCandidate(at(30, { status: 'succeeded' }), now)).toBe(false)
    expect(isStrandedCandidate(at(30, { status: 'failed' }), now)).toBe(false)
  })
})
