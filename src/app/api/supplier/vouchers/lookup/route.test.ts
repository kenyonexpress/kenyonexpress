import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The contract this route has to keep:
 *   - it never writes to a voucher (redemption is the only thing allowed to)
 *   - a forged QR is refused before any lookup, and recorded
 *   - another supplier's voucher is indistinguishable from a missing one
 *   - a spent or lapsed voucher still returns its detail, so the counter can
 *     tell the customer what happened instead of "not found"
 */

const getUser = vi.fn()
const checkRateLimit = vi.fn()
const verifyVoucherQrPayload = vi.fn()
const getSupplierMemberships = vi.fn()
const getVoucherForRedemption = vi.fn()
const recordRefusedScan = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}))
vi.mock('@/server/domain/vouchers/qr', () => ({
  verifyVoucherQrPayload: (...args: unknown[]) => verifyVoucherQrPayload(...args),
}))
vi.mock('@/lib/supplier/rbac', () => ({
  getSupplierMemberships: () => getSupplierMemberships(),
}))
vi.mock('@/server/queries/vouchers', () => ({
  getVoucherForRedemption: (...args: unknown[]) => getVoucherForRedemption(...args),
}))
vi.mock('@/server/domain/vouchers/scan-context', () => ({
  readScanContext: () => ({ ip: '203.0.113.7', userAgent: 'test' }),
  recordRefusedScan: (...args: unknown[]) => recordRefusedScan(...args),
}))

const { POST } = await import('./route')

const IN_DATE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
const PAST = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

function preview(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    code: 'ABCDEFGHJK',
    status: 'issued',
    supplierId: 'sup-1',
    faceValueAgorot: 20000,
    couponPriceAgorot: 2000,
    remainingAmountDueAgorot: 18000,
    expiresAt: IN_DATE,
    redeemedAt: null,
    productName: 'ארוחת בוקר זוגית',
    customerName: 'דנה כהן',
    ...overrides,
  }
}

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/supplier/vouchers/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  checkRateLimit.mockResolvedValue(true)
  getSupplierMemberships.mockResolvedValue(['sup-1'])
  getVoucherForRedemption.mockResolvedValue(preview())
  verifyVoucherQrPayload.mockReturnValue({
    v: 1,
    c: 'ABCDEFGHJK',
    s: 'sup-1',
    u: 'u',
    e: 1,
    k: 'k',
  })
})

describe('POST /api/supplier/vouchers/lookup', () => {
  it('returns the voucher detail and the money to collect for a live voucher', async () => {
    const res = await POST(post({ code: 'ABCDE-FGHJK' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.outcome).toBe('redeemable')
    expect(body.voucher).toMatchObject({
      code: 'ABCDEFGHJK',
      product_name: 'ארוחת בוקר זוגית',
      customer_name: 'דנה כהן',
      coupon_price_agorot: 2000,
      remaining_amount_due_agorot: 18000,
      face_value_agorot: 20000,
    })
  })

  it('normalises a hyphenated code before looking it up', async () => {
    await POST(post({ code: 'abcde-fghjk' }))
    expect(getVoucherForRedemption).toHaveBeenCalledWith('ABCDEFGHJK', ['sup-1'])
  })

  it('refuses a caller with no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(post({ code: 'ABCDEFGHJK' }))
    expect(res.status).toBe(401)
    expect(getVoucherForRedemption).not.toHaveBeenCalled()
  })

  it('refuses a request carrying neither a code nor a payload', async () => {
    const res = await POST(post({ method: 'manual' }))
    expect(res.status).toBe(400)
    expect((await res.json()).outcome).toBe('invalid_request')
  })

  it('refuses a body that is not JSON at all', async () => {
    const req = new NextRequest('http://localhost:3000/api/supplier/vouchers/lookup', {
      method: 'POST',
      body: 'not json',
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('stops at the rate limit before touching the database', async () => {
    checkRateLimit.mockResolvedValue(false)
    const res = await POST(post({ code: 'ABCDEFGHJK' }))
    expect(res.status).toBe(429)
    expect(getVoucherForRedemption).not.toHaveBeenCalled()
  })

  it('refuses a forged QR before any lookup, and records it', async () => {
    verifyVoucherQrPayload.mockReturnValue(null)
    const res = await POST(post({ qr_payload: 'KEV1.body.badmac', method: 'camera' }))
    expect(res.status).toBe(404)
    expect(getVoucherForRedemption).not.toHaveBeenCalled()
    expect(recordRefusedScan).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'invalid_signature', scanMethod: 'camera' }),
    )
  })

  it('takes the code from a verified QR payload rather than the request body', async () => {
    verifyVoucherQrPayload.mockReturnValue({
      v: 1,
      c: 'ZZZZZZZZZZ',
      s: 'sup-1',
      u: 'u',
      e: 1,
      k: 'k',
    })
    await POST(post({ code: 'ABCDEFGHJK', qr_payload: 'KEV1.body.mac' }))
    expect(getVoucherForRedemption).toHaveBeenCalledWith('ZZZZZZZZZZ', ['sup-1'])
  })

  it("reports another supplier's voucher as not found, and records the attempt", async () => {
    getVoucherForRedemption.mockResolvedValue(null)
    const res = await POST(post({ code: 'ABCDEFGHJK' }))
    expect(res.status).toBe(404)
    expect((await res.json()).outcome).toBe('not_found')
    expect(recordRefusedScan).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'not_found', codeEntered: 'ABCDEFGHJK' }),
    )
  })

  it('reports a redeemed voucher honestly, with its detail', async () => {
    getVoucherForRedemption.mockResolvedValue(preview({ status: 'redeemed', redeemedAt: PAST }))
    const res = await POST(post({ code: 'ABCDEFGHJK' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.outcome).toBe('already_redeemed')
    expect(body.voucher.redeemed_at).toBe(PAST)
  })

  // The row still says issued between the deadline and the next sweep. The
  // counter must be told expired, because redeem_voucher() will say expired.
  it('reports an issued voucher past its deadline as expired', async () => {
    getVoucherForRedemption.mockResolvedValue(preview({ expiresAt: PAST }))
    const body = await (await POST(post({ code: 'ABCDEFGHJK' }))).json()
    expect(body.outcome).toBe('expired')
  })

  it('reports cancelled and refunded distinctly', async () => {
    getVoucherForRedemption.mockResolvedValue(preview({ status: 'cancelled' }))
    expect((await (await POST(post({ code: 'ABCDEFGHJK' }))).json()).outcome).toBe('cancelled')
    getVoucherForRedemption.mockResolvedValue(preview({ status: 'refunded' }))
    expect((await (await POST(post({ code: 'ABCDEFGHJK' }))).json()).outcome).toBe('refunded')
  })

  it('passes the caller full membership set, not a single supplier', async () => {
    getSupplierMemberships.mockResolvedValue(['sup-1', 'sup-2'])
    await POST(post({ code: 'ABCDEFGHJK' }))
    expect(getVoucherForRedemption).toHaveBeenCalledWith('ABCDEFGHJK', ['sup-1', 'sup-2'])
  })
})

/**
 * A READ THAT FAILED IS NOT A VOUCHER THAT DOES NOT EXIST.
 *
 * `getVoucherForRedemption` discarded its `error`, so a failed read arrived
 * here as `null` - the same value another supplier's voucher produces - and
 * this route answered it the way it answers a code that was never issued:
 * `not_found`, 404, and a row written to the refusal log saying so.
 *
 * Both halves are wrong at a till. The customer standing there has PAID for
 * the voucher, and is sent away; and the refusal log, which exists so a
 * disputed scan can be reconstructed later, is left holding a record that says
 * the code did not exist when in fact nothing was ever looked up.
 *
 * So the query layer throws, and this route catches that specific case and
 * says "temporarily unavailable" instead - which is also the one outcome the
 * cashier can act on, by scanning again in a moment.
 */
describe('POST /api/supplier/vouchers/lookup when the read itself fails', () => {
  it('does not report a paid voucher as not found', async () => {
    getVoucherForRedemption.mockRejectedValue(new Error('voucher.read_failed: statement timeout'))

    const res = await POST(post({ code: 'ABCDEFGHJK' }))
    const body = await res.json()

    expect(body.outcome).toBe('unavailable')
    expect(res.status).toBe(503)
  })

  it('does not write a refusal saying the code does not exist', async () => {
    getVoucherForRedemption.mockRejectedValue(new Error('voucher.read_failed: statement timeout'))

    await POST(post({ code: 'ABCDEFGHJK' }))

    expect(recordRefusedScan, 'nothing was refused; nothing was even read').not.toHaveBeenCalled()
  })

  it('still records a refusal for a code that genuinely is not there', async () => {
    // The negative control: refusing to log on an ERROR must not turn into
    // refusing to log at all, or the forged-QR trail goes with it.
    getVoucherForRedemption.mockResolvedValue(null)

    const res = await POST(post({ code: 'ABCDEFGHJK' }))

    expect(res.status).toBe(404)
    expect((await res.json()).outcome).toBe('not_found')
    expect(recordRefusedScan).toHaveBeenCalledTimes(1)
    expect(recordRefusedScan.mock.calls[0]?.[0]).toMatchObject({ outcome: 'not_found' })
  })

  /**
   * THE SAME FAILURE, ONE READ EARLIER, WHICH THE BLOCK ABOVE DID NOT COVER.
   *
   * The three cases above pin the VOUCHER read. The MEMBERSHIP read reaches the
   * same two wrong answers by a route that steps over the guard entirely:
   * `getSupplierMemberships` used to swallow its error into `[]`, and
   * `getVoucherForRedemption` returns null for an empty set BEFORE its guarded
   * query runs. So nothing threw, nothing was logged, and the till was told a
   * paid voucher does not exist - with a refusal row to match.
   */
  it('does not report a paid voucher as not found when the MEMBERSHIP read fails', async () => {
    getSupplierMemberships.mockRejectedValue(
      new Error('supplier.memberships_read_failed: connection terminated'),
    )

    const res = await POST(post({ code: 'ABCDEFGHJK' }))

    expect((await res.json()).outcome).toBe('unavailable')
    expect(res.status).toBe(503)
    expect(getVoucherForRedemption, 'the voucher was never looked up').not.toHaveBeenCalled()
    expect(recordRefusedScan, 'so there was nothing to refuse').not.toHaveBeenCalled()
  })

  it('still refuses a caller whose membership set is genuinely empty', async () => {
    // The negative control for the pair: "staffs nobody" is a real answer and
    // must keep answering not_found, recorded. Only the unreadable case moved.
    getSupplierMemberships.mockResolvedValue([])
    getVoucherForRedemption.mockResolvedValue(null)

    const res = await POST(post({ code: 'ABCDEFGHJK' }))

    expect(res.status).toBe(404)
    expect((await res.json()).outcome).toBe('not_found')
    expect(recordRefusedScan).toHaveBeenCalledTimes(1)
  })
})
