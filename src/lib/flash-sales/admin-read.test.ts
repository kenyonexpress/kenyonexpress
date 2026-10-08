import { describe, expect, it, vi } from 'vitest'

/**
 * The admin list's counts (STEP 61): taken is consumed plus LIVE holds (a
 * bound hold counts past its expiry, an unbound lapsed one does not), queued
 * is a head count, consumed is units, and claims of another sale are not
 * folded in.
 */

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

const { adminFlashSaleFromRow } = await import('./admin-read')

const NOW = new Date('2026-10-08T12:00:00Z')

describe('adminFlashSaleFromRow', () => {
  it('folds the claim rows of this sale into taken, queued and consumed', () => {
    const view = adminFlashSaleFromRow(
      {
        id: 's1',
        product_id: 'p1',
        name_he: 'מבצע',
        price_agorot: '9900',
        reference_agorot: null,
        allocation: '10',
        max_per_claim: '1',
        hold_minutes: '10',
        starts_at: '2026-10-08T11:00:00Z',
        ends_at: '2026-10-08T13:00:00Z',
        is_active: true,
        created_at: '2026-10-08T10:00:00Z',
        updated_at: '2026-10-08T10:00:00Z',
        products: { name_he: 'ספל', status: 'active', kenyon_price: '120' },
      },
      [
        { flash_sale_id: 's1', status: 'consumed', quantity: 2, expires_at: null, order_id: 'o1' },
        {
          flash_sale_id: 's1',
          status: 'held',
          quantity: 1,
          expires_at: '2026-10-08T12:05:00Z',
          order_id: null,
        },
        {
          flash_sale_id: 's1',
          status: 'held',
          quantity: 1,
          expires_at: '2026-10-08T11:00:00Z',
          order_id: 'o2',
        },
        {
          flash_sale_id: 's1',
          status: 'held',
          quantity: 3,
          expires_at: '2026-10-08T11:00:00Z',
          order_id: null,
        },
        { flash_sale_id: 's1', status: 'queued', quantity: 2, expires_at: null, order_id: null },
        { flash_sale_id: 's1', status: 'queued', quantity: 1, expires_at: null, order_id: null },
        {
          flash_sale_id: 'other',
          status: 'consumed',
          quantity: 9,
          expires_at: null,
          order_id: 'o9',
        },
      ],
      NOW,
    )
    expect(view.taken).toBe(4)
    expect(view.consumed).toBe(2)
    expect(view.queued).toBe(2)
    expect(view.product_name_he).toBe('ספל')
    expect(view.product_kenyon_price).toBe(120)
    expect(view.price_agorot).toBe(9900)
  })
})
