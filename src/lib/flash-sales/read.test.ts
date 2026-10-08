import { describe, expect, it, vi } from 'vitest'

/**
 * The row-to-view edges of the storefront reads (STEP 61). The queries are
 * exercised against production shapes by hand; what a test can pin is that
 * the PostgREST embed (an object or a one-element array, numerics as
 * strings) becomes integer agorot and one product, and that the cart's hold
 * list keeps exactly the live holds.
 */

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/anon', () => ({ createPublicClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const { flashSaleFromRow } = await import('./read')
const { holdsFromRows } = await import('./holds')

const NOW = new Date('2026-10-08T12:00:00Z')

describe('flashSaleFromRow', () => {
  it('turns numeric strings into integers and unwraps a one-element embed', () => {
    const view = flashSaleFromRow({
      id: 's1',
      product_id: 'p1',
      name_he: 'מבצע',
      price_agorot: '9900',
      reference_agorot: '19900',
      allocation: '10',
      max_per_claim: '2',
      hold_minutes: '10',
      starts_at: '2026-10-08T11:00:00Z',
      ends_at: '2026-10-08T13:00:00Z',
      is_active: true,
      products: [
        {
          name_he: 'ספל',
          slug: 'mug',
          images: ['/images/mug.webp'],
          kenyon_price: '120.5',
          full_price: null,
          stock_quantity: 4,
          status: 'active',
        },
      ],
    })
    expect(view.price_agorot).toBe(9900)
    expect(view.reference_agorot).toBe(19900)
    expect(view.allocation).toBe(10)
    expect(view.max_per_claim).toBe(2)
    expect(view.product).toEqual({
      name_he: 'ספל',
      slug: 'mug',
      image_url: '/images/mug.webp',
      kenyon_price: 120.5,
      full_price: null,
      stock_quantity: 4,
      status: 'active',
    })
  })

  it('keeps a null reference and a missing product as null', () => {
    const view = flashSaleFromRow({
      id: 's1',
      product_id: 'p1',
      name_he: 'מבצע',
      price_agorot: 9900,
      reference_agorot: null,
      allocation: 10,
      max_per_claim: 0,
      hold_minutes: 0,
      starts_at: '2026-10-08T11:00:00Z',
      ends_at: '2026-10-08T13:00:00Z',
      is_active: false,
      products: null,
    })
    expect(view.reference_agorot).toBeNull()
    expect(view.product).toBeNull()
    expect(view.is_active).toBe(false)
    // Never below one, whatever a row says.
    expect(view.max_per_claim).toBe(1)
    expect(view.hold_minutes).toBe(1)
  })
})

describe('holdsFromRows', () => {
  it('keeps live and bound holds, drops lapsed ones and other statuses', () => {
    const holds = holdsFromRows(
      [
        {
          flash_sale_id: 'live',
          status: 'held',
          quantity: '2',
          expires_at: '2026-10-08T12:05:00Z',
          order_id: null,
          flash_sales: { product_id: 'p1', price_agorot: '9900' },
        },
        {
          flash_sale_id: 'bound',
          status: 'held',
          quantity: 1,
          expires_at: '2026-10-08T11:00:00Z',
          order_id: 'o1',
          flash_sales: [{ product_id: 'p2', price_agorot: 500 }],
        },
        {
          flash_sale_id: 'lapsed',
          status: 'held',
          quantity: 1,
          expires_at: '2026-10-08T11:59:59Z',
          order_id: null,
          flash_sales: { product_id: 'p3', price_agorot: 500 },
        },
        {
          flash_sale_id: 'queued',
          status: 'queued',
          quantity: 1,
          expires_at: null,
          order_id: null,
          flash_sales: { product_id: 'p4', price_agorot: 500 },
        },
        {
          flash_sale_id: 'orphan',
          status: 'held',
          quantity: 1,
          expires_at: '2026-10-08T12:05:00Z',
          order_id: null,
          flash_sales: null,
        },
      ],
      NOW,
    )
    expect(holds).toEqual([
      { flash_sale_id: 'live', product_id: 'p1', price_agorot: 9900, quantity: 2 },
      { flash_sale_id: 'bound', product_id: 'p2', price_agorot: 500, quantity: 1 },
    ])
  })
})
