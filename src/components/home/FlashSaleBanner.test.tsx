import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The home banner (STEP 61). Pinned: nothing at all without a sale (the
 * ordinary state, and what keeps the home page byte-identical to before);
 * with a live sale, the name, the product, both prices in shekels, the
 * percentage, the remaining meter and a link to the sale page; a sold-out
 * sale invites the waiting room; an ended sale renders nothing even if the
 * cached read handed it over; the "was" price falls back to the product's
 * compare-at when the row carries none.
 */

const mock = vi.hoisted(() => ({ sale: null as unknown }))

vi.mock('@/lib/flash-sales/read', () => ({
  getHomeFlashSale: async () => mock.sale,
}))
vi.mock('@/components/flash/FlashCountdown', () => ({
  default: () => <output data-testid="countdown">--:--:--</output>,
}))

const { default: FlashSaleBanner } = await import('./FlashSaleBanner')

const future = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

function sale(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    product_id: 'p1',
    name_he: 'ספל בבזק',
    price_agorot: 2990,
    reference_agorot: 5990,
    allocation: 20,
    max_per_claim: 1,
    hold_minutes: 10,
    starts_at: future(-10),
    ends_at: future(50),
    is_active: true,
    remaining: 7,
    product: {
      name_he: 'ספל קרמיקה',
      slug: 'mug',
      image_url: '/images/mug.webp',
      kenyon_price: 59.9,
      full_price: 79.9,
      stock_quantity: 10,
      status: 'active',
    },
    ...overrides,
  }
}

beforeEach(() => {
  mock.sale = null
})

describe('FlashSaleBanner', () => {
  it('renders nothing when there is no sale', async () => {
    expect(renderToStaticMarkup(await FlashSaleBanner())).toBe('')
  })

  it('renders the live sale with both prices, the percentage, the meter and the link', async () => {
    mock.sale = sale()
    const html = renderToStaticMarkup(await FlashSaleBanner())
    expect(html).toContain('data-testid="flash-sale-banner"')
    expect(html).toContain('ספל בבזק')
    expect(html).toContain('ספל קרמיקה')
    expect(html).toContain('29.90')
    expect(html).toContain('59.90')
    expect(html).toContain('50% הנחה')
    expect(html).toContain('נותרו כ-7 מתוך 20')
    expect(html).toContain('href="/flash/11111111-1111-4111-8111-111111111111"')
    expect(html).toContain('לתפוס יחידה')
    expect(html).toContain('data-testid="countdown"')
  })

  it('invites the waiting room when every unit is taken', async () => {
    mock.sale = sale({ remaining: 0 })
    const html = renderToStaticMarkup(await FlashSaleBanner())
    expect(html).toContain('לחדר ההמתנה')
    expect(html).toContain('כל היחידות תפוסות')
  })

  it('renders nothing for an ended or switched-off sale, whatever the cache handed over', async () => {
    mock.sale = sale({ ends_at: future(-1) })
    expect(renderToStaticMarkup(await FlashSaleBanner())).toBe('')
    mock.sale = sale({ is_active: false })
    expect(renderToStaticMarkup(await FlashSaleBanner())).toBe('')
    mock.sale = sale({ product: null })
    expect(renderToStaticMarkup(await FlashSaleBanner())).toBe('')
  })

  it('falls back to the product compare-at for the "was" price and says בקרוב before the start', async () => {
    mock.sale = sale({ reference_agorot: null, starts_at: future(30), ends_at: future(90) })
    const html = renderToStaticMarkup(await FlashSaleBanner())
    expect(html).toContain('79.90')
    expect(html).toContain('בקרוב')
    expect(html).toContain('לפרטי המבצע')
  })
})
