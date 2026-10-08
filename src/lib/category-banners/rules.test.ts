import { describe, expect, it } from 'vitest'
import {
  type CategoryBanner,
  bannerEventPath,
  bannerPhase,
  clickThroughPercent,
  isBannerEventKind,
  isInternalHref,
  isMissingBannerSchema,
  pickLiveBanner,
} from './rules'

/**
 * The pure half of category banners (STEP 62). Pinned: an open window on
 * either end, `off` beating every schedule, the pick preferring priority
 * then the most recent start, the internal-path rule the database CHECKs,
 * and the error codes that read as "migration 267 not applied".
 */

const NOW = new Date('2026-10-08T12:00:00Z')

function banner(overrides: Partial<CategoryBanner> = {}): CategoryBanner {
  return {
    id: 'b1',
    category_id: 'c1',
    title_he: 'כותרת',
    subtitle_he: null,
    image_url: '/banner.webp',
    image_alt_he: 'תמונה',
    cta_label_he: null,
    cta_href: null,
    theme: 'light',
    starts_at: null,
    ends_at: null,
    priority: 0,
    is_active: true,
    ...overrides,
  }
}

describe('bannerPhase', () => {
  it('is live with no window at all', () => {
    expect(bannerPhase(banner(), NOW)).toBe('live')
  })

  it('reads an open start and an open end', () => {
    expect(bannerPhase(banner({ ends_at: '2026-10-09T00:00:00Z' }), NOW)).toBe('live')
    expect(bannerPhase(banner({ ends_at: '2026-10-08T11:00:00Z' }), NOW)).toBe('ended')
    expect(bannerPhase(banner({ starts_at: '2026-10-08T13:00:00Z' }), NOW)).toBe('scheduled')
    expect(bannerPhase(banner({ starts_at: '2026-10-08T11:00:00Z' }), NOW)).toBe('live')
  })

  it('treats the end instant itself as ended and the start instant as live', () => {
    expect(bannerPhase(banner({ ends_at: NOW.toISOString() }), NOW)).toBe('ended')
    expect(bannerPhase(banner({ starts_at: NOW.toISOString() }), NOW)).toBe('live')
  })

  it('reports off regardless of the schedule', () => {
    expect(bannerPhase(banner({ is_active: false, starts_at: '2026-10-08T13:00:00Z' }), NOW)).toBe(
      'off',
    )
    expect(bannerPhase(banner({ is_active: false }), NOW)).toBe('off')
  })

  it('reads an unparseable instant as no bound', () => {
    expect(bannerPhase(banner({ starts_at: 'not a date' }), NOW)).toBe('live')
  })
})

describe('pickLiveBanner', () => {
  it('returns null with nothing live', () => {
    expect(pickLiveBanner([], NOW)).toBeNull()
    expect(
      pickLiveBanner(
        [
          banner({ id: 'a', is_active: false }),
          banner({ id: 'b', starts_at: '2026-10-09T00:00:00Z' }),
          banner({ id: 'c', ends_at: '2026-10-01T00:00:00Z' }),
        ],
        NOW,
      ),
    ).toBeNull()
  })

  it('prefers the highest priority among the live ones', () => {
    const picked = pickLiveBanner(
      [
        banner({ id: 'evergreen', priority: 0 }),
        banner({ id: 'campaign', priority: 10, starts_at: '2026-10-08T09:00:00Z' }),
        banner({ id: 'future', priority: 99, starts_at: '2026-10-09T00:00:00Z' }),
      ],
      NOW,
    )
    expect(picked?.id).toBe('campaign')
  })

  it('breaks a priority tie by the most recent start, with no start sorting oldest', () => {
    const picked = pickLiveBanner(
      [
        banner({ id: 'always' }),
        banner({ id: 'older', starts_at: '2026-10-01T00:00:00Z' }),
        banner({ id: 'newer', starts_at: '2026-10-08T09:00:00Z' }),
      ],
      NOW,
    )
    expect(picked?.id).toBe('newer')
  })

  it('hands back to the evergreen banner once the campaign ends', () => {
    const rows = [
      banner({ id: 'always' }),
      banner({
        id: 'campaign',
        priority: 5,
        starts_at: '2026-10-08T09:00:00Z',
        ends_at: '2026-10-08T11:00:00Z',
      }),
    ]
    expect(pickLiveBanner(rows, new Date('2026-10-08T10:00:00Z'))?.id).toBe('campaign')
    expect(pickLiveBanner(rows, NOW)?.id).toBe('always')
  })

  it('is deterministic on a full tie', () => {
    const rows = [banner({ id: 'b' }), banner({ id: 'a' })]
    expect(pickLiveBanner(rows, NOW)?.id).toBe('a')
    expect(pickLiveBanner([...rows].reverse(), NOW)?.id).toBe('a')
  })
})

describe('isInternalHref', () => {
  it('accepts a root-relative path with a query', () => {
    expect(isInternalHref('/products')).toBe(true)
    expect(isInternalHref('/category/hot-deals?sort=price')).toBe(true)
  })

  it('refuses URLs, protocol-relative paths, and whitespace', () => {
    expect(isInternalHref('https://evil.example')).toBe(false)
    expect(isInternalHref('//evil.example')).toBe(false)
    expect(isInternalHref('products')).toBe(false)
    expect(isInternalHref('/a b')).toBe(false)
    expect(isInternalHref('')).toBe(false)
    expect(isInternalHref(`/${'x'.repeat(500)}`)).toBe(false)
  })
})

describe('isMissingBannerSchema', () => {
  it('recognises the absent table and function codes and messages', () => {
    expect(isMissingBannerSchema({ code: '42P01' })).toBe(true)
    expect(isMissingBannerSchema({ code: 'PGRST205' })).toBe(true)
    expect(isMissingBannerSchema({ code: '42883' })).toBe(true)
    expect(
      isMissingBannerSchema({ message: 'relation "public.category_banners" does not exist' }),
    ).toBe(true)
    expect(isMissingBannerSchema({ code: '23514', message: 'check violation' })).toBe(false)
    expect(isMissingBannerSchema(null)).toBe(false)
  })
})

describe('event helpers', () => {
  it('accepts exactly the two kinds', () => {
    expect(isBannerEventKind('impression')).toBe(true)
    expect(isBannerEventKind('click')).toBe(true)
    expect(isBannerEventKind('hover')).toBe(false)
    expect(isBannerEventKind(undefined)).toBe(false)
  })

  it('builds the route path with the id encoded', () => {
    expect(bannerEventPath('abc')).toBe('/api/category-banners/abc/events')
    expect(bannerEventPath('a/b')).toBe('/api/category-banners/a%2Fb/events')
  })

  it('computes a whole-percent click-through, null with nothing shown', () => {
    expect(clickThroughPercent(0, 0)).toBeNull()
    expect(clickThroughPercent(0, 3)).toBeNull()
    expect(clickThroughPercent(200, 7)).toBe(4)
    expect(clickThroughPercent(3, 1)).toBe(33)
  })
})
