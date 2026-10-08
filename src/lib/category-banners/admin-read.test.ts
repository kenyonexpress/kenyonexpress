import { describe, expect, it, vi } from 'vitest'

/**
 * The admin read of category banners (STEP 62). Pinned: the embed shape (an
 * object or a one-element array) becomes one category, the counters are
 * summed per banner and only per banner, the click-through is folded in, and
 * the stats window starts the right number of days back in UTC.
 */

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

const { adminBannerFromRow, statsWindowStart, STATS_WINDOW_DAYS } = await import('./admin-read')

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'b1',
  category_id: 'c1',
  title_he: 'כותרת',
  subtitle_he: null,
  image_url: '/b.webp',
  image_alt_he: 'תמונה',
  cta_label_he: null,
  cta_href: null,
  theme: 'light',
  starts_at: null,
  ends_at: null,
  priority: '3',
  is_active: true,
  created_at: '2026-10-08T10:00:00Z',
  updated_at: '2026-10-08T10:00:00Z',
  categories: [{ name_he: 'מבצעים חמים', slug: 'hot-deals' }],
  ...overrides,
})

describe('adminBannerFromRow', () => {
  it('unwraps a one-element embed and sums this banner’s counters only', () => {
    const banner = adminBannerFromRow(row() as never, [
      { banner_id: 'b1', impressions: '100', clicks: '4' },
      { banner_id: 'b1', impressions: 50, clicks: 2 },
      { banner_id: 'other', impressions: 999, clicks: 999 },
    ])
    expect(banner.category_name_he).toBe('מבצעים חמים')
    expect(banner.category_slug).toBe('hot-deals')
    expect(banner.impressions).toBe(150)
    expect(banner.clicks).toBe(6)
    expect(banner.ctr).toBe(4)
    expect(banner.priority).toBe(3)
  })

  it('reads an object embed, and a null one as no category', () => {
    const object = adminBannerFromRow(
      row({ categories: { name_he: 'חדש', slug: 'new' } }) as never,
      [],
    )
    expect(object.category_slug).toBe('new')
    const none = adminBannerFromRow(row({ categories: null }) as never, [])
    expect(none.category_name_he).toBeNull()
    expect(none.category_slug).toBeNull()
    expect(none.impressions).toBe(0)
    expect(none.ctr).toBeNull()
  })
})

describe('statsWindowStart', () => {
  it('starts the window the configured number of days back, today included, in UTC', () => {
    expect(STATS_WINDOW_DAYS).toBe(30)
    expect(statsWindowStart(new Date('2026-10-08T23:30:00Z'), 30)).toBe('2026-09-09')
    expect(statsWindowStart(new Date('2026-10-08T00:10:00Z'), 1)).toBe('2026-10-08')
    expect(statsWindowStart(new Date('2026-03-01T12:00:00Z'), 2)).toBe('2026-02-28')
  })
})
