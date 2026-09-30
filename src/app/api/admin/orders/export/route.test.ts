import type { BoardOrder } from '@/server/queries/fulfillment-board'
import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The board export: the guard, the query it forwards, and the file.
 *
 * A plain GET at a guessable URL that returns every customer's name, phone
 * and address city; the guard is what most of this file is about.
 */

const getSessionWithRole = vi.fn()
const loadBoardOrders = vi.fn()

vi.mock('@/lib/admin/rbac', () => ({ getSessionWithRole: () => getSessionWithRole() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/server/queries/fulfillment-board', async () => {
  const actual = await vi.importActual<typeof import('@/server/queries/fulfillment-board')>(
    '@/server/queries/fulfillment-board',
  )
  return {
    ...actual,
    loadBoardOrders: (_c: unknown, filters: unknown) => loadBoardOrders(filters),
  }
})

const { GET } = await import('./route')

const ORDER: BoardOrder = {
  id: '3b6e6f1e-9c2a-4b7e-8d3f-1a2b3c4d5e6f',
  ref: 'KE-7',
  invoice_number: 'KE-7',
  status: 'paid',
  lane: 'paid',
  total_agorot: 9900,
  created_at: '2026-10-01T06:00:00.000Z',
  customer: 'רון',
  email: 'ron@example.com',
  phone: '',
  city: '',
  couponLines: 0,
  physicalLines: 1,
  lines: [
    {
      id: 'l',
      product_type: 'physical',
      item_status: 'pending',
      carrier: null,
      tracking_number: null,
    },
  ],
}

function call(query = '') {
  return GET(new Request(`http://localhost/api/admin/orders/export?${query}`) as NextRequest)
}

beforeEach(() => {
  vi.clearAllMocks()
  getSessionWithRole.mockResolvedValue({ userId: 'u1', role: 'admin' })
  loadBoardOrders.mockResolvedValue({ orders: [ORDER], error: null })
})

describe('the guard', () => {
  it('answers 403 to a signed-out request, not a redirect', async () => {
    getSessionWithRole.mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(403)
    expect(loadBoardOrders).not.toHaveBeenCalled()
  })

  it('answers 403 to a role without the orders section', async () => {
    getSessionWithRole.mockResolvedValue({ userId: 'u2', role: 'content_uploader' })
    expect((await call()).status).toBe(403)
    expect(loadBoardOrders).not.toHaveBeenCalled()
  })
})

describe('the file', () => {
  it('is a UTF-8 CSV with a BOM, an attachment header and no caching', async () => {
    const res = await call('lane=paid')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('content-disposition')).toContain('paid')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    // `text()` strips a BOM by spec, so the bytes are what prove it is there.
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    const body = new TextDecoder().decode(bytes)
    expect(body).toContain('KE-7')
    expect(body).toContain('99.00')
  })

  it('forwards the board filters, and a selection of ids', async () => {
    await call('lane=shipped&q=%D7%93%D7%A0%D7%94&from=2026-09-01&to=2026-09-30')
    expect(loadBoardOrders).toHaveBeenCalledWith({
      lane: 'shipped',
      q: 'דנה',
      from: '2026-09-01',
      to: '2026-09-30',
    })
    await call(`ids=${ORDER.id},4c7f7a2f-0d3b-4c8f-9e4a-2b3c4d5e6f70`)
    expect(loadBoardOrders).toHaveBeenLastCalledWith({
      ids: [ORDER.id, '4c7f7a2f-0d3b-4c8f-9e4a-2b3c4d5e6f70'],
    })
  })

  it('rejects an unknown lane and a non-uuid id with 400', async () => {
    expect((await call('lane=flying')).status).toBe(400)
    expect((await call('ids=abc')).status).toBe(400)
    expect(loadBoardOrders).not.toHaveBeenCalled()
  })

  it('answers 503 and not an empty file when the read fails', async () => {
    loadBoardOrders.mockResolvedValue({ orders: [], error: 'permission denied' })
    const res = await call()
    expect(res.status).toBe(503)
  })
})
