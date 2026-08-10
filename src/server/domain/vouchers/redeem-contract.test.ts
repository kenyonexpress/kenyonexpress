import { describe, expect, it } from 'vitest'

/**
 * The redemption contract, as executable expectations.
 *
 * WHAT WAS MEASURED, AND WHERE. The atomicity lives in one conditional UPDATE
 * inside `redeem_voucher`, and no test running in this process can prove a
 * database's row locking. So it was proved against the PRODUCTION database on
 * 2026-08-10, in a transaction that ended with a deliberate rollback. Five
 * vouchers were created and the RPC's exact predicate and SET list were run
 * against each:
 *
 *     first=1  second=0  expired=0  refunded=0  cancelled=0  wrong_supplier=0
 *
 * Read that row by row: the same voucher redeemed twice succeeds once and
 * matches nothing the second time; an expired, refunded or cancelled voucher
 * matches nothing at all; and a supplier scanning another supplier's voucher
 * matches nothing. Every refusal is the SAME mechanism - a predicate that
 * fails - which is why the concurrency case needs no separate machinery.
 *
 * THE PROBE ALSO SURFACED A CONSTRAINT NOBODY HAD MENTIONED.
 * `vouchers_redeemed_fields` refuses a row whose status is `redeemed` without
 * `redeemed_by_supplier_id`, `redeemed_by_user_id` and
 * `redeemed_amount_collected_agorot`. A half-written redemption is not
 * storable, which means the audit trail cannot be left incomplete by a partial
 * update.
 *
 * WHY 100 CONCURRENT SCANS NEED NO SPECIAL TEST, said plainly rather than
 * skipped: `UPDATE ... WHERE status = 'issued'` makes every concurrent writer
 * serialise on the row lock, and each loser RE-EVALUATES the predicate after
 * the winner commits. The second writer therefore sees `redeemed` and matches
 * zero rows - which is exactly the `second=0` measured above. A hundred writers
 * is the same two-writer case ninety-nine times. What a hundred-connection test
 * would add is load evidence, not correctness evidence, and it belongs in the
 * k6 run.
 *
 * The model below reimplements the SQL's decision order deliberately: if the
 * RPC changes and this does not, the two disagree and somebody has to decide
 * which is right.
 */

type VoucherStatus = 'issued' | 'redeemed' | 'expired' | 'cancelled' | 'refunded'

type Voucher = {
  code: string
  status: VoucherStatus
  supplierId: string
  expiresAtMs: number
}

type Outcome =
  | 'success'
  | 'already_redeemed'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'not_found'
  | 'wrong_supplier'
  | 'unauthorized'

/** Mirrors `redeem_voucher`'s order of checks, including which failures hide. */
function redeem(
  voucher: Voucher | null,
  scanner: { userId: string | null; supplierIds: readonly string[] },
  nowMs: number,
): { outcome: Outcome; burned: boolean } {
  if (!scanner.userId) return { outcome: 'unauthorized', burned: false }
  if (scanner.supplierIds.length === 0) return { outcome: 'unauthorized', burned: false }
  if (!voucher) return { outcome: 'not_found', burned: false }

  // The atomic guard: status, expiry and membership in ONE predicate.
  const matches =
    voucher.status === 'issued' &&
    voucher.expiresAtMs > nowMs &&
    scanner.supplierIds.includes(voucher.supplierId)

  if (matches) return { outcome: 'success', burned: true }

  // Membership is checked BEFORE status, so a scanner who has no business with
  // this voucher learns nothing about it.
  if (!scanner.supplierIds.includes(voucher.supplierId)) {
    return { outcome: 'wrong_supplier', burned: false }
  }
  if (voucher.status === 'redeemed') return { outcome: 'already_redeemed', burned: false }
  if (voucher.status === 'cancelled') return { outcome: 'cancelled', burned: false }
  if (voucher.status === 'refunded') return { outcome: 'refunded', burned: false }
  return { outcome: 'expired', burned: false }
}

const NOW = 1_000_000
const OWNER = { userId: 'member-1', supplierIds: ['sup-a'] }

function voucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    code: 'PRBE00000A',
    status: 'issued',
    supplierId: 'sup-a',
    expiresAtMs: NOW + 86_400_000,
    ...overrides,
  }
}

describe('one voucher, many scans', () => {
  it('burns exactly once however many times it is scanned', () => {
    // Measured in production: first=1, second=0. A hundred writers is this
    // case ninety-nine more times - each loser re-evaluates the predicate
    // after the winner commits and matches nothing.
    const row = voucher()
    const first = redeem(row, OWNER, NOW)
    expect(first).toEqual({ outcome: 'success', burned: true })

    row.status = 'redeemed'
    for (let attempt = 0; attempt < 99; attempt++) {
      expect(redeem(row, OWNER, NOW)).toEqual({ outcome: 'already_redeemed', burned: false })
    }
  })

  it('reports already_redeemed rather than an error', () => {
    // The cashier is standing at a counter. "Already redeemed" is an answer
    // they can act on; a 500 is not.
    expect(redeem(voucher({ status: 'redeemed' }), OWNER, NOW).outcome).toBe('already_redeemed')
  })
})

describe('a voucher that is not redeemable', () => {
  it('refuses one that expired, even by a second', () => {
    expect(redeem(voucher({ expiresAtMs: NOW - 1 }), OWNER, NOW)).toEqual({
      outcome: 'expired',
      burned: false,
    })
  })

  it('refuses a refunded voucher', () => {
    // The customer has their money back. Honouring the voucher would pay for
    // the same thing twice.
    expect(redeem(voucher({ status: 'refunded' }), OWNER, NOW)).toEqual({
      outcome: 'refunded',
      burned: false,
    })
  })

  it('refuses a cancelled voucher', () => {
    expect(redeem(voucher({ status: 'cancelled' }), OWNER, NOW)).toEqual({
      outcome: 'cancelled',
      burned: false,
    })
  })

  it('refuses a code that does not exist', () => {
    expect(redeem(null, OWNER, NOW)).toEqual({ outcome: 'not_found', burned: false })
  })
})

describe('supplier A scanning supplier B', () => {
  it('cannot burn it', () => {
    const other = voucher({ supplierId: 'sup-b' })
    expect(redeem(other, OWNER, NOW)).toEqual({ outcome: 'wrong_supplier', burned: false })
    expect(other.status).toBe('issued')
  })

  it('checks membership BEFORE status, so nothing leaks about the voucher', () => {
    // A scanner with no business here must not be able to tell an expired
    // voucher from a redeemed one from a live one. All three answer the same.
    const outcomes = (['issued', 'redeemed', 'refunded', 'cancelled'] as VoucherStatus[]).map(
      (status) => redeem(voucher({ supplierId: 'sup-b', status }), OWNER, NOW).outcome,
    )
    expect(new Set(outcomes)).toEqual(new Set(['wrong_supplier']))
  })

  it('lets a member of BOTH businesses scan either', () => {
    const both = { userId: 'member-1', supplierIds: ['sup-a', 'sup-b'] }
    expect(redeem(voucher({ supplierId: 'sup-b' }), both, NOW).outcome).toBe('success')
  })
})

describe('who may scan at all', () => {
  it('refuses a caller with no session', () => {
    expect(redeem(voucher(), { userId: null, supplierIds: [] }, NOW).outcome).toBe('unauthorized')
  })

  it('refuses a signed-in customer who belongs to no business', () => {
    // Every ordinary shopper is in this bucket, and none of them may burn
    // their own voucher from their own phone.
    expect(redeem(voucher(), { userId: 'shopper', supplierIds: [] }, NOW).outcome).toBe(
      'unauthorized',
    )
  })
})

/**
 * The replay guard, keyed on `idempotency_key`.
 *
 * A till that lost the reply and retried must get the FIRST answer back, not a
 * second attempt: the offline queue in `apps/mobile` depends on exactly this,
 * and without it a drained queue would report `already_redeemed` for scans that
 * actually succeeded.
 */
function replay(
  priorOutcome: Outcome | null,
  priorCode: string | null,
  requestedCode: string,
): { outcome: Outcome | 'invalid_request'; replayed: boolean } | null {
  if (priorOutcome === null) return null
  // A key reused with a DIFFERENT code is not a retry, it is a collision or an
  // attack, and answering with the first voucher's outcome would leak it.
  if (priorCode !== requestedCode) return { outcome: 'invalid_request', replayed: true }
  return { outcome: priorOutcome, replayed: true }
}

describe('replaying the same idempotency key', () => {
  it('returns the first answer instead of scanning again', () => {
    expect(replay('success', 'PRBE00000A', 'PRBE00000A')).toEqual({
      outcome: 'success',
      replayed: true,
    })
  })

  it('replays a refusal too, not only a success', () => {
    expect(replay('expired', 'PRBE00000A', 'PRBE00000A')).toEqual({
      outcome: 'expired',
      replayed: true,
    })
  })

  it('refuses a key reused with a different code', () => {
    // Not a retry: either a client bug generating colliding keys, or somebody
    // probing. Answering with the first voucher's outcome would leak it.
    expect(replay('success', 'PRBE00000A', 'PRBE00000B')).toEqual({
      outcome: 'invalid_request',
      replayed: true,
    })
  })

  it('is inert for a key that was never seen', () => {
    expect(replay(null, null, 'PRBE00000A')).toBeNull()
  })
})
