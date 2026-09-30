import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.hoisted(() => vi.fn())
const orderRead = vi.hoisted(() => vi.fn())
const getOrderInvoice = vi.hoisted(() => vi.fn())
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
vi.mock('@/server/payments/invoices', () => ({ getOrderInvoice }))

import { GET } from './route'

/**
 * The invoice's door. The document lives at the provider (or on the R2
 * mirror), so the only thing this route may do is confirm, on every request,
 * that the caller owns the order, and only then hand over the location. A
 * foreign id and a missing order are the same 404, and an order whose
 * document has not been issued yet is a 404 too, not a 500.
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
    documentNumber: 'INV-7',
    documentUrl: DOC_URL,
    issuedAt: '2026-09-10T12:00:00Z',
  })
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
    expect((await call()).status).toBe(404)

    getOrderInvoice.mockResolvedValue({ documentNumber: null, documentUrl: null, issuedAt: null })
    const response = await call()
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('עדיין לא הונפקה')
  })

  it('redirects the owner to the document and only then', async () => {
    const response = await call()
    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.status).toBeLessThan(400)
    expect(response.headers.get('location')).toBe(DOC_URL)
    expect(getOrderInvoice).toHaveBeenCalledWith(expect.anything(), ORDER_ID)
  })
})
