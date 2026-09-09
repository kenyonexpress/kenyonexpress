import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireSupplierMember, getSupplierRedemptions } = vi.hoisted(() => ({
  requireSupplierMember: vi.fn(),
  getSupplierRedemptions: vi.fn(),
}))

vi.mock('@/lib/supplier/rbac', () => ({ requireSupplierMember }))
vi.mock('@/server/queries/supplier', () => ({ getSupplierRedemptions }))

import type { NextRequest } from 'next/server'
import { GET } from './route'

// `withRequestLog` types its handler on NextRequest. The route reads nothing
// off the request at all -- that is the point of it, see the route's header --
// so a plain Request carries everything this exercises.
function req(): NextRequest {
  return new Request(
    'https://kenyonexpress.co.il/api/supplier/redemptions/csv',
  ) as unknown as NextRequest
}

const REDEMPTION = {
  voucherId: 'v-1',
  code: 'ABCDE12345',
  productName: 'ארוחה זוגית',
  customerName: null,
  remainingAmountDueAgorot: 14_000,
  couponPriceAgorot: 6_000,
  platformPercent: 30,
  redeemedAt: '2026-09-01T10:00:00Z',
  status: 'redeemed',
}

beforeEach(() => {
  requireSupplierMember.mockReset()
  getSupplierRedemptions.mockReset()
  requireSupplierMember.mockResolvedValue({ supplierId: 'sup-1', memberRole: 'scanner' })
  getSupplierRedemptions.mockResolvedValue({
    rows: [REDEMPTION],
    truncated: false,
    failed: false,
  })
})

describe('supplier redemptions CSV', () => {
  /**
   * "Own data only" is structural, not a check. There is no supplier id in the
   * request at all -- no query parameter, no body, no header -- so the only id
   * that exists is the one the membership guard read for this caller. An
   * endpoint with nothing to tamper with has no authorisation check to get
   * wrong.
   */
  it('takes the supplier id from the session and accepts none from the caller', async () => {
    await GET(req())
    expect(requireSupplierMember).toHaveBeenCalledWith('/supplier/redemptions')
    expect(getSupplierRedemptions).toHaveBeenCalledWith('sup-1')
    expect(getSupplierRedemptions).toHaveBeenCalledTimes(1)
  })

  it('exports each amount as a shekel string AND the raw agorot integer', async () => {
    const body = await (await GET(req())).text()
    expect(body).toContain('14000')
    expect(body).toContain('6000')
    expect(body).toContain('ארוחה זוגית')
    // The grouped display form, which is what is printed on the voucher.
    expect(body).toContain('ABCDE-12345')
  })

  it('carries no customer identity', async () => {
    // `customerName` is null by design in the query; the export must not become
    // the place that reintroduces it.
    const body = await (await GET(req())).text()
    expect(body).not.toMatch(/לקוח|customer|email|@/)
  })

  it('answers as a dated CSV attachment', async () => {
    const response = await GET(req())
    const disposition = response.headers.get('content-disposition') ?? ''
    expect(disposition).toMatch(/redemptions-\d{4}-\d{2}-\d{2}\.csv/)
  })

  it.each([
    ['truncated', { rows: [REDEMPTION], truncated: true, failed: false }],
    ['failed', { rows: [], truncated: false, failed: true }],
  ])('refuses to export a %s read rather than shipping a partial file', async (_label, read) => {
    getSupplierRedemptions.mockResolvedValue(read)
    const response = await GET(req())
    expect(response.status).toBe(503)
    expect(response.headers.get('content-disposition')).toBeNull()
  })

  it('does not swallow the gate: an unauthorised caller propagates', async () => {
    requireSupplierMember.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(GET(req())).rejects.toThrow('NEXT_REDIRECT')
    expect(getSupplierRedemptions).not.toHaveBeenCalled()
  })
})
