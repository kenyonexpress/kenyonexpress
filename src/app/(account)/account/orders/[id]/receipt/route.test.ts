import { agorot } from '@/lib/money'
import type { OrderDetail } from '@/server/queries/orders'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.hoisted(() => vi.fn())
const getOrderDetail = vi.hoisted(() => vi.fn())
const addressRead = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: addressRead }) }),
      }),
    }),
  }),
}))
vi.mock('@/server/queries/orders', () => ({ getOrderDetail }))
vi.mock('@/lib/observability/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { GET } from './route'

/**
 * The receipt's door: closed to strangers, 404 for an order that is not the
 * caller's or not yet paid, and otherwise a real PDF served as a private
 * attachment. What the PDF says is `lib/orders/receipt-pdf.test.ts`.
 */

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const USER = { id: 'user-1', email: 'dana@example.com', phone: null, user_metadata: {} }

function paidOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: ORDER_ID,
    status: 'paid',
    settlementStatus: 'paid',
    createdAt: '2026-09-10T11:58:00Z',
    paidAt: '2026-09-10T12:00:00Z',
    subtotalAgorot: agorot(4_000),
    totalAgorot: agorot(4_000),
    walletAppliedAgorot: agorot(0),
    addressId: null,
    invoice: null,
    lines: [
      {
        id: 'line-1',
        productId: 'p1',
        productName: 'ארוחה זוגית',
        productSlug: 'meal',
        productImage: null,
        productType: 'coupon',
        quantity: 1,
        unitPriceAgorot: agorot(15_000),
        totalAgorot: agorot(15_000),
        paidOnSiteAgorot: agorot(4_000),
        balanceDueAgorot: agorot(11_000),
        settlementStatus: 'paid',
        itemStatus: 'issued',
        carrier: null,
        trackingNumber: null,
        shippedAt: null,
        deliveredAt: null,
        supplier: null,
        vouchers: [],
      },
    ],
    ...overrides,
  }
}

function call(): Promise<Response> {
  return GET(new NextRequest(`http://localhost/account/orders/${ORDER_ID}/receipt`), {
    params: Promise.resolve({ id: ORDER_ID }),
  })
}

describe('GET /account/orders/[id]/receipt', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: USER } })
    getOrderDetail.mockReset().mockResolvedValue(paidOrder())
    addressRead.mockReset().mockResolvedValue({ data: null, error: null })
  })

  it('sends a stranger to log in, with the order page as the way back', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const response = await call()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login?next=')
    expect(getOrderDetail).not.toHaveBeenCalled()
  })

  it('is 404 for an order the caller does not own', async () => {
    getOrderDetail.mockResolvedValue(null)
    const response = await call()
    expect(response.status).toBe(404)
  })

  it('is 404, not 500, for an order that has not been paid yet', async () => {
    getOrderDetail.mockResolvedValue(paidOrder({ paidAt: null }))
    const response = await call()
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('לא שולמה')
  })

  it('serves a private PDF attachment named by the order reference', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="kenyonexpress-receipt-11111111.pdf"',
    )
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(10_000)
  })

  it('still renders when the address read fails', async () => {
    getOrderDetail.mockResolvedValue(paidOrder({ addressId: 'addr-1' }))
    addressRead.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const response = await call()
    expect(response.status).toBe(200)
  })
})
