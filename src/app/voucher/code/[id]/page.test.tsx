import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /voucher/code/[id] page tests
 *
 * Verifies that the route renders both QR and 8-digit redemption codes
 * for authenticated users with valid vouchers.
 */

const mockVoucher = {
  id: 'test-voucher-id',
  code: '1234567890', // 10-char code
  qr_payload: 'KEV1.test.payload',
  redemption_code: '12345678', // 8-digit redemption code
  status: 'issued' as const,
  face_value_agorot: 10000,
  coupon_price_agorot: 8000,
  remaining_amount_due_agorot: 2000,
  offer_valid_until: '2099-12-31T23:59:59Z', // Far future to ensure presentable
  expires_at: '2099-12-31T23:59:59Z',
  issued_at: '2024-10-24T00:00:00Z',
  redeemed_at: null,
  product: {
    name_he: 'מוצר לדוגמה',
    slug: 'test-product',
    city: 'תל אביב',
  },
  supplier: {
    name: 'ספק לדוגמה',
  },
}

const { getCustomerVoucher } = vi.hoisted(() => ({
  getCustomerVoucher: vi.fn(),
}))

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

const { voucherQrDataUrl } = vi.hoisted(() => ({
  voucherQrDataUrl: vi.fn(),
}))

vi.mock('@/server/queries/vouchers', () => ({ getCustomerVoucher }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/vouchers/qr-image', () => ({ voucherQrDataUrl }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
}))

import VoucherCodePage from './page'

/**
 * Walks the React tree and extracts all text content.
 * Same approach as /redeem/[token] tests.
 */
function text(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join(' ')
  if (typeof node !== 'object') return ''
  return Object.values(node.props ?? {})
    .map(text)
    .join(' ')
}

async function renderBody(id = 'test-id'): Promise<unknown> {
  const params = Promise.resolve({ id })
  const shell = VoucherCodePage({ params }) as any
  return await shell.props.children.type({ params })
}

describe('/voucher/code/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to login when not authenticated', async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    })

    await expect(renderBody('test-id')).rejects.toThrow(
      'REDIRECT:/login?next=%2Fvoucher%2Fcode%2Ftest-id',
    )
  })

  it('returns 404 when voucher not found', async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
      },
    })
    getCustomerVoucher.mockResolvedValue(null)

    await expect(renderBody('nonexistent')).rejects.toThrow('NOT_FOUND')
  })

  it('renders voucher with QR and 8-digit code for valid voucher', async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
      },
    })
    getCustomerVoucher.mockResolvedValue(mockVoucher)
    voucherQrDataUrl.mockResolvedValue('data:image/png;base64,TEST_QR')

    const page = await renderBody('test-voucher-id')
    const content = text(page)

    // Verify QR section is present
    expect(content).toContain('קוד QR לסריקה')
    expect(content).toContain('סרוק את הקוד בקופה')

    // Verify 8-digit code section
    expect(content).toContain('או הקלד את הקוד')
    expect(content).toContain('1234-5678') // First 8 digits formatted
    expect(content).toContain('8 ספרות לפדיון ידני')

    // Verify product and supplier info
    expect(content).toContain('מוצר לדוגמה')
    expect(content).toContain('ספק לדוגמה')
    expect(content).toContain('תל אביב')

    // Verify status message
    expect(content).toContain('הצג מסך זה לקופאי לפדיון הקופון')
  })

  it('does not render QR for non-presentable vouchers', async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
      },
    })

    const redeemedVoucher = {
      ...mockVoucher,
      status: 'redeemed' as const,
      redeemed_at: '2024-10-23T12:00:00Z',
    }

    getCustomerVoucher.mockResolvedValue(redeemedVoucher)
    voucherQrDataUrl.mockResolvedValue(null)

    const page = await renderBody('test-voucher-id')
    const content = text(page)

    // QR should not be rendered
    expect(content).not.toContain('קוד QR לסריקה')
    expect(content).not.toContain('או הקלד את הקוד')

    // Should show non-redeemable message
    expect(content).toContain('קופון זה לא ניתן יותר לפדיון')
  })

  it('handles vouchers without product info gracefully', async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
      },
    })

    const minimalVoucher = {
      ...mockVoucher,
      product: null,
      supplier: null,
    }

    getCustomerVoucher.mockResolvedValue(minimalVoucher)
    voucherQrDataUrl.mockResolvedValue('data:image/png;base64,TEST_QR')

    const page = await renderBody('test-voucher-id')
    const content = text(page)

    // Should still render QR and code
    expect(content).toContain('קוד QR לסריקה')
    expect(content).toContain('1234-5678')

    // Should show fallback text for product name
    expect(content).toContain('קופון')
  })
})
