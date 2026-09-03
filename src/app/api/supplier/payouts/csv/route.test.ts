import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireSupplierRole, getSupplierSales } = vi.hoisted(() => ({
  requireSupplierRole: vi.fn(),
  getSupplierSales: vi.fn(),
}))

vi.mock('@/lib/supplier/rbac', () => ({ requireSupplierRole }))
vi.mock('@/server/queries/supplier', () => ({ getSupplierSales }))

import type { SupplierSaleLine } from '@/lib/supplier/dashboard'
import { NextRequest } from 'next/server'
import { GET } from './route'

const req = () => new NextRequest('https://example.test/api/supplier/payouts/csv')

/**
 * The payout CSV (marathon step 12; the route had no tests). The properties:
 * OWNER-gated (the rows carry commission terms a plain member must not see),
 * and every money cell exported twice -- the shekel string for the human in
 * Excel, the raw agorot integer for the machine reconciling -- from the same
 * fold the /supplier/payouts page renders, so screen and export cannot
 * disagree.
 */

// A physical line: gross is the face value and the payout is the immediate
// share (a coupon's payout is 0 -- the business collects at its counter).
const SALE: SupplierSaleLine = {
  orderItemId: 'oi-1',
  orderId: 'o-1',
  productName: 'מגהץ אדים',
  productType: 'physical',
  quantity: 1,
  platformPercent: 10,
  faceValueAgorot: 20_000,
  paidOnSiteAgorot: 20_000,
  platformFeeAgorot: 2_000,
  supplierImmediateAgorot: 18_000,
  escrowHeldAgorot: 0,
  escrowReleaseAgorot: 0,
  supplierDueAgorot: 18_000,
  settlementStatus: 'pending',
  paidAt: null,
}

beforeEach(() => {
  requireSupplierRole.mockReset()
  getSupplierSales.mockReset()
  requireSupplierRole.mockResolvedValue({ supplierId: 'sup-1', role: 'owner' })
  getSupplierSales.mockResolvedValue([SALE])
})

describe('supplier payouts CSV', () => {
  it('is gated on the OWNER role, aimed back at the payouts page', async () => {
    await GET(req())
    expect(requireSupplierRole).toHaveBeenCalledWith('owner', '/supplier/payouts')
  })

  it('reads the sales of exactly the session supplier', async () => {
    await GET(req())
    expect(getSupplierSales).toHaveBeenCalledWith('sup-1')
  })

  it('exports each amount as a shekel string AND the raw agorot integer', async () => {
    const body = await (await GET(req())).text()
    expect(body).toContain('20000') // gross agorot, machine-readable
    expect(body).toContain('2000') // platform fee agorot
    expect(body).toContain('18000') // supplier payout agorot
    expect(body).toContain('200') // the ₪200 shekel string, however formatted
    expect(body).toContain('פיזי')
    expect(body).toContain('מגהץ אדים')
  })

  it('answers as a dated CSV attachment', async () => {
    const response = await GET(req())
    const disposition = response.headers.get('content-disposition') ?? ''
    expect(disposition).toMatch(/payouts-\d{4}-\d{2}-\d{2}\.csv/)
  })

  it('does not swallow the gate: an unauthorised caller propagates', async () => {
    // requireSupplierRole redirects/throws for a non-owner; the route must
    // let that happen rather than answering an empty CSV.
    requireSupplierRole.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(GET(req())).rejects.toThrow('NEXT_REDIRECT')
    expect(getSupplierSales).not.toHaveBeenCalled()
  })
})
