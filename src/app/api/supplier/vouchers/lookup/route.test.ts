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
