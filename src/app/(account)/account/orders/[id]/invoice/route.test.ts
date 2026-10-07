import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.hoisted(() => vi.fn())
const orderRead = vi.hoisted(() => vi.fn())
const getOrderInvoice = vi.hoisted(() => vi.fn())
const renderIssuedInvoiceCopy = vi.hoisted(() => vi.fn())
const filters = vi.hoisted(() => [] as [string, unknown[]][])

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'is']) {
        chain[method] = (...args: unknown[]) => {
          filters.push([method, args])
          return chain
        }
      }
      chain.maybeSingle = orderRead
      return chain
    },
  }),
}))
vi.mock('@/server/payments/invoices', () => ({ getOrderInvoice, renderIssuedInvoiceCopy }))

import { GET } from './route'

/**
 * The invoice's door. The only thing this route may do before anything else
 * is confirm, on every request, that the caller owns the order. Then it hands
 * over the archived file's location when there is one, or renders the
 * document itself as a marked copy when there is not (the measured state of
 * this account: no R2). A foreign id and a missing order are the same 404,
 * and an order whose document has not been issued yet is a 404 too, not a
 * 500.
 */

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const USER = { id: 'user-1' }
const DOC_URL = 'https://invoices.example/doc/abc.pdf'

function call(): Promise<Response> {
  return GET(new Request(`http://localhost/account/orders/${ORDER_ID}/invoice`), {
    params: Promise.resolve({ id: ORDER_ID }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  filters.length = 0
  getUser.mockResolvedValue({ data: { user: USER } })
  orderRead.mockResolvedValue({ data: { id: ORDER_ID }, error: null })
  getOrderInvoice.mockResolvedValue({
    id: 'inv-1',
    documentNumber: 'KE-INV-000007',
    documentUrl: DOC_URL,
    issuedAt: '2026-09-10T12:00:00Z',
  })
  renderIssuedInvoiceCopy.mockResolvedValue(null)
})

describe('GET /account/orders/[id]/invoice', () => {
  it('sends a stranger to log in, back to this order, without reading anything', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const response = await call()
    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.status).toBeLessThan(400)
    const location = response.headers.get('location') ?? ''
    expect(location).toContain('/login?next=')
    expect(decodeURIComponent(location)).toContain(`/account/orders/${ORDER_ID}`)
    expect(orderRead).not.toHaveBeenCalled()
    expect(getOrderInvoice).not.toHaveBeenCalled()
  })

  it('filters the order on the caller, so a foreign id is the same 404 as none', async () => {
    orderRead.mockResolvedValue({ data: null, error: null })
    const response = await call()
    expect(response.status).toBe(404)
    expect(getOrderInvoice).not.toHaveBeenCalled()

    const eqs = filters.filter(([m]) => m === 'eq').map(([, args]) => args)
    expect(eqs).toContainEqual(['id', ORDER_ID])
    expect(eqs).toContainEqual(['user_id', USER.id])
    expect(filters.filter(([m]) => m === 'is').map(([, args]) => args)).toContainEqual([
      'deleted_at',
      null,
    ])
  })

  it('answers 404, not 500, while the document is not issued yet', async () => {
    getOrderInvoice.mockResolvedValue(null)
    const response = await call()
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('עדיין לא הונפקה')
    expect(renderIssuedInvoiceCopy).not.toHaveBeenCalled()
  })

  it('renders the document itself, as a copy, when there is no archived file', async () => {
    getOrderInvoice.mockResolvedValue({
      id: 'inv-1',
      documentNumber: 'KE-INV-000007',
      documentUrl: null,
      issuedAt: '2026-09-10T12:00:00Z',
    })
    renderIssuedInvoiceCopy.mockResolvedValue({
      bytes: new TextEncoder().encode('%PDF-fake'),
      fileName: 'KE-INV-000007.pdf',
      documentNumber: 'KE-INV-000007',
    })

    const response = await call()
    expect(response.status).toBe(200)
    expect(renderIssuedInvoiceCopy).toHaveBeenCalledWith(expect.anything(), 'inv-1')
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toBe('inline; filename="KE-INV-000007.pdf"')
    // A tax document under a session: no shared cache may keep it.
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toBe('%PDF-fake')
  })

  it('answers 404 when the copy cannot be drawn from the row', async () => {
    getOrderInvoice.mockResolvedValue({
      id: 'inv-1',
      documentNumber: 'KE-INV-000007',
      documentUrl: null,
      issuedAt: '2026-09-10T12:00:00Z',
    })
    renderIssuedInvoiceCopy.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })

  it('redirects the owner to the archived document and only then', async () => {
    const response = await call()
    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.status).toBeLessThan(400)
    expect(response.headers.get('location')).toBe(DOC_URL)
    expect(getOrderInvoice).toHaveBeenCalledWith(expect.anything(), ORDER_ID)
  })
})
