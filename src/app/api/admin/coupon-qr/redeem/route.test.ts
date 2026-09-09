import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The redemption door for printed QR coupon codes.
 *
 * The single-use lock itself lives in the database (redeem_coupon_qr, 217)
 * and is proven there; what the route owes and what these tests hold it to:
 * the write-permission gate on a money-spending endpoint, the Luhn gate
 * before any lookup, an honest translation of every verdict (replay is
 * success, absence is 404, a spent code is 409), and an audit row for every
 * redemption that actually happened, replays included.
 */

const getSessionWithRole = vi.fn()
const canWriteSection = vi.fn()
const writeAuditLog = vi.fn()
const redeem = vi.fn()

vi.mock('@/lib/admin/rbac', () => ({
  getSessionWithRole: (...args: unknown[]) => getSessionWithRole(...args),
}))
vi.mock('@/lib/admin/permissions', () => ({
  canWriteSection: (...args: unknown[]) => canWriteSection(...args),
}))
vi.mock('@/lib/admin/audit', () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}))
vi.mock('@/lib/growth/client', () => ({
  growthClient: () => ({ qrRedemption: () => ({ redeem }) }),
}))

import { luhnCheckDigit } from '@/lib/coupons/unit-codes'
import { POST } from './route'

// A structurally valid code, built with the real check digit rather than
// hardcoded, so this test cannot drift from the generator.
const VALID_CODE = `0000021${luhnCheckDigit('0000021')}`
const ORDER_ID = '7d9c1a52-3f60-4f0e-9a3d-2b8c11ec0f5a'
const USER_ID = '2f1e9d40-8b7a-4c3e-b1d5-6a0f4e9c8d21'

function request(body: unknown): NextRequest {
  return new NextRequest('https://example.test/api/admin/coupon-qr/redeem', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function validBody() {
  return { code: VALID_CODE, order_id: ORDER_ID, user_id: USER_ID, amount_agorot: 500 }
}

describe('coupon QR redemption route', () => {
  beforeEach(() => {
    getSessionWithRole.mockReset()
    canWriteSection.mockReset()
    writeAuditLog.mockReset()
    redeem.mockReset()
    getSessionWithRole.mockResolvedValue({ userId: 'admin-1', role: 'admin' })
    canWriteSection.mockReturnValue(true)
    writeAuditLog.mockResolvedValue(undefined)
    redeem.mockResolvedValue({
      data: { ok: true, campaign_id: 'camp-1', amount_agorot: 500 },
      error: null,
    })
  })

  describe('the guard', () => {
    it('refuses with no session and asks the database nothing', async () => {
      getSessionWithRole.mockResolvedValue(null)
      expect((await POST(request(validBody()))).status).toBe(403)
      expect(redeem).not.toHaveBeenCalled()
    })

    it('refuses a role without discounts write', async () => {
      canWriteSection.mockReturnValue(false)
      expect((await POST(request(validBody()))).status).toBe(403)
      expect(canWriteSection).toHaveBeenCalledWith('admin', 'discounts')
      expect(redeem).not.toHaveBeenCalled()
    })
  })

  describe('shape gates before the lock', () => {
    it('refuses a body that is not the contract', async () => {
      expect((await POST(request({ code: VALID_CODE }))).status).toBe(400)
      expect(redeem).not.toHaveBeenCalled()
    })

    it('refuses a fractional amount: money is integer agorot', async () => {
      const body = { ...validBody(), amount_agorot: 12.5 }
      expect((await POST(request(body))).status).toBe(400)
      expect(redeem).not.toHaveBeenCalled()
    })

    it('fails a wrong check digit locally, before any lookup', async () => {
      const body = { ...validBody(), code: `0000021${(luhnCheckDigit('0000021') + 1) % 10}` }
      const response = await POST(request(body))
      expect(response.status).toBe(422)
      expect((await response.json()).reason).toBe('invalid_code')
      expect(redeem).not.toHaveBeenCalled()
    })
  })

  describe('verdict translation', () => {
    it('404 for a code that does not exist', async () => {
      redeem.mockResolvedValue({ data: { ok: false, reason: 'unknown' }, error: null })
      expect((await POST(request(validBody()))).status).toBe(404)
    })

    it('409 for a code another order already spent', async () => {
      redeem.mockResolvedValue({ data: { ok: false, reason: 'redeemed' }, error: null })
      const response = await POST(request(validBody()))
      expect(response.status).toBe(409)
      expect((await response.json()).reason).toBe('redeemed')
      expect(writeAuditLog).not.toHaveBeenCalled()
    })

    it('409 for an expired code', async () => {
      redeem.mockResolvedValue({ data: { ok: false, reason: 'expired' }, error: null })
      expect((await POST(request(validBody()))).status).toBe(409)
    })

    it('500 when the RPC itself fails', async () => {
      redeem.mockResolvedValue({ data: null, error: { message: 'boom' } })
      expect((await POST(request(validBody()))).status).toBe(500)
      expect(writeAuditLog).not.toHaveBeenCalled()
    })
  })

  it('redeems, audits, and reports the campaign', async () => {
    const response = await POST(request(validBody()))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      campaign_id: 'camp-1',
      amount_agorot: 500,
      replay: false,
    })
    expect(redeem).toHaveBeenCalledWith({
      code: VALID_CODE,
      orderId: ORDER_ID,
      userId: USER_ID,
      amountAgorot: 500,
    })
    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'status_change',
        entityType: 'coupon_qr_codes',
        entityId: VALID_CODE,
        changes: expect.objectContaining({ state: 'redeemed' }),
      }),
    )
  })

  it('reports a replay of the same order as success, marked as such', async () => {
    redeem.mockResolvedValue({
      data: { ok: true, reason: 'already_claimed', campaign_id: 'camp-1' },
      error: null,
    })
    const response = await POST(request(validBody()))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.replay).toBe(true)
  })
})
