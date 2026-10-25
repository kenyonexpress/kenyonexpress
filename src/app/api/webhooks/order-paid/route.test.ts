/**
 * Tests for the order-paid webhook handler.
 */

import { notifyNewOrder } from '@/lib/notifications'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'
import { POST } from './route'

// Mock dependencies
vi.mock('@/lib/notifications')
vi.mock('@/lib/supabase/admin')

describe('POST /api/webhooks/order-paid', () => {
  const mockSupabase = {
    from: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase as any)
    vi.mocked(notifyNewOrder).mockResolvedValue()
  })

  it('returns 401 without the bearer secret', async () => {
    const req = new NextRequest('http://localhost/api/webhooks/order-paid', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'order-1' }),
    })

    const response = await POST(req)

    expect(response.status).toBe(401)
    expect(notifyNewOrder).not.toHaveBeenCalled()
  })

  it('returns 400 if orderId is missing', async () => {
    const req = new NextRequest('http://localhost/api/webhooks/order-paid', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
      body: JSON.stringify({}),
    })

    const response = await POST(req)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('orderId required')
  })

  it('returns 404 if order not found', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
        }),
      }),
    })

    const req = new NextRequest('http://localhost/api/webhooks/order-paid', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
      body: JSON.stringify({ orderId: 'test-order-id' }),
    })

    const response = await POST(req)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Order not found')
  })

  it('skips notification if order status is not paid', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'order-1', status: 'pending', total_ils_agorot: 10000 },
            error: null,
          }),
        }),
      }),
    })

    const req = new NextRequest('http://localhost/api/webhooks/order-paid', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
      body: JSON.stringify({ orderId: 'order-1' }),
    })

    const response = await POST(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.skipped).toBe(true)
    expect(body.reason).toContain('pending')
    expect(notifyNewOrder).not.toHaveBeenCalled()
  })

  it('sends notification for paid order', async () => {
    mockSupabase.from
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'order-1', status: 'paid', total_ils_agorot: 15000 },
              error: null,
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ product_title: 'קפה אספרסו' }],
              error: null,
            }),
          }),
        }),
      })

    const req = new NextRequest('http://localhost/api/webhooks/order-paid', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
      body: JSON.stringify({ orderId: 'order-1' }),
    })

    const response = await POST(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.notified).toBe(true)
    expect(notifyNewOrder).toHaveBeenCalledWith({
      orderId: 'order-1',
      productTitle: 'קפה אספרסו',
      amountAgorot: 15000,
    })
  })
})
