import { INVOICE_LINK_TTL_SECONDS, signInvoiceLink } from '@/lib/invoices/download-token'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getOrderInvoice = vi.fn()
vi.mock('@/server/payments/invoices', () => ({
  getOrderInvoice: (...a: unknown[]) => getOrderInvoice(...a),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { GET } from './route'

const ORDER = 'b3c1d2e4-0000-4000-8000-000000000001'
const ctx = { params: Promise.resolve({ orderId: ORDER }) }

function req(exp: string | number, sig: string) {
  return new Request(`https://x.test/api/invoices/${ORDER}/download?exp=${exp}&sig=${sig}`)
}

describe('GET /api/invoices/[orderId]/download', () => {
  beforeEach(() => {
    vi.stubEnv('VOUCHER_QR_SECRET', 'y'.repeat(32))
    getOrderInvoice.mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('404s a bad signature without touching the database', async () => {
    const res = await GET(req(9999999999, 'nope') as never, ctx as never)
    expect(res.status).toBe(404)
    expect(getOrderInvoice).not.toHaveBeenCalled()
  })

  it('410s an expired link', async () => {
    const p = signInvoiceLink(ORDER, Date.now() - (INVOICE_LINK_TTL_SECONDS + 10) * 1000)
    const res = await GET(req(p.exp, p.sig) as never, ctx as never)
    expect(res.status).toBe(410)
  })

  it('404s a valid link when no invoice has been issued', async () => {
    getOrderInvoice.mockResolvedValue(null)
    const p = signInvoiceLink(ORDER)
    const res = await GET(req(p.exp, p.sig) as never, ctx as never)
    expect(res.status).toBe(404)
  })

  it('streams the document as an attachment without revealing the provider url', async () => {
    getOrderInvoice.mockResolvedValue({
      documentNumber: 'INV-1001',
      documentUrl: 'https://provider.example/doc/1.pdf',
      issuedAt: null,
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('%PDF-1.4', { status: 200, headers: { 'content-type': 'application/pdf' } }),
        ),
    )
    const p = signInvoiceLink(ORDER)
    const res = await GET(req(p.exp, p.sig) as never, ctx as never)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('content-disposition')).toContain('INV-1001')
    expect(res.headers.get('location')).toBeNull()
    expect(await res.text()).toBe('%PDF-1.4')
  })
})
