import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The category hero (STEP 62). Pinned: nothing at all without a live banner
 * (the ordinary state, and what keeps every category page byte-identical to
 * before); with one, the headline, the second line, the image with its alt
 * text, the CTA as the only link, the theme's text colour, and the tracker
 * keyed on the section's id; a banner with no CTA renders no link at all.
 */

const mock = vi.hoisted(() => ({ banner: null as unknown, now: null as Date | null }))

vi.mock('@/lib/category-banners/read', () => ({
  getLiveCategoryBanner: async (_id: string, now: Date) => {
    mock.now = now
    return mock.banner
  },
}))
vi.mock('@/components/category/CategoryBannerTracker', () => ({
  default: (props: Record<string, string>) => (
    <output data-testid="tracker" data-banner={props.bannerId} data-element={props.elementId} />
  ),
}))

const { default: CategoryHeroBanner } = await import('./CategoryHeroBanner')

const BANNER = '11111111-1111-4111-8111-111111111111'

function banner(overrides: Record<string, unknown> = {}) {
  return {
    id: BANNER,
    category_id: 'c1',
    title_he: 'מבצעי החורף',
    subtitle_he: 'עד 40% הנחה על כוסות חמות',
    image_url: 'https://cdn.example/banner.webp',
    image_alt_he: 'כוסות חמות על שלג',
    cta_label_he: 'לכל המבצעים',
    cta_href: '/category/hot-deals',
    theme: 'light',
    starts_at: null,
    ends_at: null,
    priority: 0,
    is_active: true,
    ...overrides,
  }
}

async function html(props: { categoryId: string; now?: Date }) {
  return renderToStaticMarkup(await CategoryHeroBanner(props))
}

beforeEach(() => {
  mock.banner = null
  mock.now = null
})

describe('CategoryHeroBanner', () => {
  it('renders nothing without a live banner', async () => {
    expect(await html({ categoryId: 'c1' })).toBe('')
  })

  it('passes the request clock to the read', async () => {
    const now = new Date('2026-10-08T10:00:00Z')
    await html({ categoryId: 'c1', now })
    expect(mock.now).toBe(now)
  })

  it('renders the copy, the image with alt text, and the CTA as the only link', async () => {
    mock.banner = banner()
    const out = await html({ categoryId: 'c1' })
    expect(out).toContain('מבצעי החורף')
    expect(out).toContain('עד 40% הנחה על כוסות חמות')
    expect(out).toContain('alt="כוסות חמות על שלג"')
    expect(out).toContain('href="/category/hot-deals"')
    expect(out).toContain('לכל המבצעים')
    expect(out.match(/<a /g)).toHaveLength(1)
    expect(out).toContain(`id="category-hero-${BANNER}"`)
    expect(out).toContain(`aria-labelledby="category-hero-${BANNER}-title"`)
    expect(out).toContain('dir="rtl"')
  })

  it('wires the tracker to the section id and the banner id', async () => {
    mock.banner = banner()
    const out = await html({ categoryId: 'c1' })
    expect(out).toContain(`data-banner="${BANNER}"`)
    expect(out).toContain(`data-element="category-hero-${BANNER}"`)
  })

  it('renders no link at all for a banner without a CTA', async () => {
    mock.banner = banner({ cta_label_he: null, cta_href: null, subtitle_he: null })
    const out = await html({ categoryId: 'c1' })
    expect(out).toContain('מבצעי החורף')
    expect(out).not.toContain('<a ')
  })

  it('switches the text colour and the gradient with the theme', async () => {
    mock.banner = banner({ theme: 'light' })
    const light = await html({ categoryId: 'c1' })
    expect(light).toContain('text-white')
    expect(light).toContain('bg-gradient-to-l')

    mock.banner = banner({ theme: 'dark' })
    const dark = await html({ categoryId: 'c1' })
    expect(dark).toContain('text-heading')
    expect(dark).not.toContain('bg-gradient-to-l')
  })
})
