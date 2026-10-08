import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The storefront read of category banners (STEP 62). Pinned: the row shape
 * becomes the typed shape (a half CTA is dropped, an unknown theme falls to
 * light, a numeric-string priority becomes an integer); the cached read asks
 * for the category's ACTIVE rows only and answers an empty list on the absent
 * table, on any other error and on a throw; and the live pick runs against
 * the caller's clock, not the cache's.
 */

const mock = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  throws: false,
  chain: [] as [string, unknown[]][],
  warn: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ log: { warn: (...a: unknown[]) => mock.warn(...a) } }))
vi.mock('@/lib/supabase/anon', () => ({
  createPublicClient: () => {
    if (mock.throws) throw new Error('no network')
    const builder: Record<string, unknown> = {}
    const chainable = (name: string) =>
      Object.assign((...args: unknown[]) => {
        mock.chain.push([name, args])
        return builder
      }, {})
    for (const name of ['from', 'select', 'eq', 'order']) builder[name] = chainable(name)
    builder.limit = (...args: unknown[]) => {
      mock.chain.push(['limit', args])
      return Promise.resolve(mock.result)
    }
    return builder
  },
}))

const { bannerFromRow, getCategoryBanners, getLiveCategoryBanner } = await import('./read')

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'b1',
  category_id: 'c1',
  title_he: 'כותרת',
  subtitle_he: 'שורה',
  image_url: '/b.webp',
  image_alt_he: 'תמונה',
  cta_label_he: 'לכל המבצעים',
  cta_href: '/products',
  theme: 'dark',
  starts_at: null,
  ends_at: null,
  priority: '5',
  is_active: true,
  ...overrides,
})

beforeEach(() => {
  mock.result = { data: null, error: null }
  mock.throws = false
  mock.chain.length = 0
  mock.warn.mockReset()
})

describe('bannerFromRow', () => {
  it('keeps a full CTA, integerises the priority and reads the theme', () => {
    const banner = bannerFromRow(row())
    expect(banner.cta_label_he).toBe('לכל המבצעים')
    expect(banner.cta_href).toBe('/products')
    expect(banner.priority).toBe(5)
    expect(banner.theme).toBe('dark')
    expect(banner.subtitle_he).toBe('שורה')
  })

  it('drops a half CTA, blanks an empty subtitle and falls back to the light theme', () => {
    const banner = bannerFromRow(
      row({
        cta_label_he: 'לחצו',
        cta_href: null,
        subtitle_he: '   ',
        theme: 'neon',
        priority: null,
      }),
    )
    expect(banner.cta_label_he).toBeNull()
    expect(banner.cta_href).toBeNull()
    expect(banner.subtitle_he).toBeNull()
    expect(banner.theme).toBe('light')
    expect(banner.priority).toBe(0)
  })
})

describe('getCategoryBanners', () => {
  it('asks for the category’s active rows and maps them', async () => {
    mock.result = { data: [row(), row({ id: 'b2', is_active: true })], error: null }
    const banners = await getCategoryBanners('c1')
    expect(banners.map((b) => b.id)).toEqual(['b1', 'b2'])
    expect(mock.chain).toContainEqual(['from', ['category_banners']])
    expect(mock.chain).toContainEqual(['eq', ['category_id', 'c1']])
    expect(mock.chain).toContainEqual(['eq', ['is_active', true]])
  })

  it('answers an empty list on the absent table, with one warning, and on any other error', async () => {
    mock.result = { data: null, error: { code: '42P01', message: 'relation does not exist' } }
    expect(await getCategoryBanners('c1')).toEqual([])
    expect(await getCategoryBanners('c1')).toEqual([])
    expect(
      mock.warn.mock.calls.filter(([n]) => n === 'category_banners.schema_absent'),
    ).toHaveLength(1)

    mock.result = { data: null, error: { code: '57014', message: 'canceling statement' } }
    expect(await getCategoryBanners('c1')).toEqual([])
    expect(mock.warn).toHaveBeenLastCalledWith(
      'category_banners.read_failed',
      expect.objectContaining({ reason: 'canceling statement' }),
    )
  })

  it('answers an empty list when the client throws', async () => {
    mock.throws = true
    expect(await getCategoryBanners('c1')).toEqual([])
    expect(mock.warn).toHaveBeenCalledWith('category_banners.read_threw', expect.anything())
  })
})

describe('getLiveCategoryBanner', () => {
  it('picks with the caller’s clock over the cached rows', async () => {
    mock.result = {
      data: [
        row({ id: 'always', priority: '0' }),
        row({
          id: 'campaign',
          priority: '9',
          starts_at: '2026-10-08T09:00:00Z',
          ends_at: '2026-10-08T11:00:00Z',
        }),
      ],
      error: null,
    }
    expect((await getLiveCategoryBanner('c1', new Date('2026-10-08T10:00:00Z')))?.id).toBe(
      'campaign',
    )
    expect((await getLiveCategoryBanner('c1', new Date('2026-10-08T12:00:00Z')))?.id).toBe('always')
  })

  it('is null with no rows', async () => {
    mock.result = { data: [], error: null }
    expect(await getLiveCategoryBanner('c1')).toBeNull()
  })
})
