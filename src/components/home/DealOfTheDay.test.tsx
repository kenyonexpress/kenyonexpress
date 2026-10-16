import type { DealOfTheDay as Deal } from '@/lib/homepage/below-fold-rules'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDealOfTheDay = vi.hoisted(() => vi.fn())
vi.mock('@/lib/homepage/below-fold', () => ({ getDealOfTheDay }))

// The CTA is a client island on the cart provider; the section's markup is
// what is under test, so the island renders the props it was handed.
vi.mock('@/components/cart/AddToCartButton', () => ({
  default: (p: {
    productId: string
    priceAgorot?: number | null
    addedLabel?: string
    addedClassName?: string
    className?: string
    children?: React.ReactNode
  }) => (
    <button
      type="button"
      data-product-id={p.productId}
      data-price-agorot={p.priceAgorot ?? undefined}
      data-added-label={p.addedLabel}
      data-added-class={p.addedClassName}
      className={p.className}
    >
      {p.children}
    </button>
  ),
}))

import DealOfTheDay from './DealOfTheDay'

const DEAL: Deal = {
  id: '0b5e1c2a-7d4f-4a6e-9b3c-1f2e3d4c5b6a',
  slug: 'laser-hair-removal',
  nameHe: 'הסרת שיער בלייזר קר',
  imageUrl: '/images/products/laser.webp',
  priceAgorot: 25000,
  referenceAgorot: 50000,
  discountBp: 5000,
  category: { name_he: 'טיפוח בריאות ויופי', slug: 'beauty-health' },
}

async function dom(deal: Deal | null) {
  getDealOfTheDay.mockResolvedValue(deal)
  const html = renderToStaticMarkup(await DealOfTheDay())
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

/**
 * UX08 (14.10.2026). Before (logs/ux08/before.json): the percentage was a
 * 25px-radius yellow chip inline in the price row, the countdown sat on its
 * own row as a label beside a monospace chip, the CTA was a link to the
 * product page, and the card and the photograph wore the 25px modal radius.
 */
describe('DealOfTheDay (UX08)', () => {
  beforeEach(() => getDealOfTheDay.mockReset())

  it('renders nothing when the catalogue has no deal', async () => {
    const root = await dom(null)
    expect(root.innerHTML).toBe('')
  })

  it('pins the discount badge to the photograph, in the shape every deals card wears', async () => {
    const root = await dom(DEAL)
    const picture = root.querySelector('a[aria-label$="לעמוד המוצר"]') as HTMLAnchorElement
    expect(picture).not.toBeNull()
    const badge = picture.querySelector('[data-deal-badge]') as HTMLElement
    expect(badge, 'the badge is inside the photograph link').not.toBeNull()
    expect(badge.textContent).toBe('-50%')
    // The ltr that keeps "-50%" in that order is on an inner span: `end-0`
    // resolves against the element's own direction, so an ltr on the badge
    // itself would pin it to the RIGHT corner (measured 14.10).
    expect(badge.getAttribute('dir')).toBeNull()
    expect(badge.querySelector('span[dir="ltr"]')?.textContent).toBe('-50%')
    expect(badge.getAttribute('aria-hidden')).toBe('true')
    for (const cls of [
      'absolute',
      'end-0',
      'top-0',
      'rounded-sm',
      'bg-deal-badge',
      'px-2',
      'py-0.5',
      'text-badge',
      'font-bold',
      'text-white',
    ])
      expect(badge.classList.contains(cls), cls).toBe(true)
    // The picture box clips it to the same 12px corner it has itself.
    expect(picture.classList.contains('overflow-hidden')).toBe(true)
    expect(picture.classList.contains('rounded-elevated')).toBe(true)
    // Spoken, not seen: the percentage stays in the price row for a screen reader.
    const sr = [...root.querySelectorAll('.sr-only')].map((el) => el.textContent)
    expect(sr).toContain('50% הנחה')
    // And no second, inline chip.
    expect(root.querySelectorAll('[data-deal-badge]')).toHaveLength(1)
    expect(root.innerHTML).not.toMatch(/bg-brand px-2 py-1/)
  })

  it('omits the badge and the spoken percentage when there is no discount to show', async () => {
    const root = await dom({ ...DEAL, discountBp: 0, referenceAgorot: DEAL.priceAgorot })
    expect(root.querySelector('[data-deal-badge]')).toBeNull()
    expect(root.querySelector('.sr-only')).toBeNull()
  })

  it('puts the countdown pill in the heading row, after the title', async () => {
    const root = await dom(DEAL)
    const h2 = root.querySelector('#deal-of-the-day-title') as HTMLElement
    const row = h2.parentElement as HTMLElement
    expect(row.classList.contains('flex-wrap')).toBe(true)
    const pill = row.querySelector('[data-deal-countdown]')
    expect(pill, 'the countdown shares the row with the title').not.toBeNull()
    expect(h2.compareDocumentPosition(pill as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('adds to the cart from the section, and no longer links out as "לרכישה"', async () => {
    const root = await dom(DEAL)
    const links = [...root.querySelectorAll('a')].map((a) => a.textContent?.trim())
    expect(links).not.toContain('לרכישה')
    const cta = root.querySelector('button[data-product-id]') as HTMLButtonElement
    expect(cta).not.toBeNull()
    expect(cta.dataset.productId).toBe(DEAL.id)
    expect(cta.dataset.priceAgorot).toBe('25000')
    expect(cta.dataset.addedLabel).toBe('נוסף לעגלה')
    expect(cta.dataset.addedClass).toBe('deal-cta--added')
    expect(cta.textContent?.trim()).toBe('הוסף לעגלה')
    expect(cta.querySelector('svg'), 'a cart glyph before the label').not.toBeNull()
    // Rest: the yellow pill. Added: the sale green with white, by data-added.
    for (const cls of [
      'rounded-full',
      'bg-brand-primary',
      'text-heading',
      'min-h-11',
      'data-added:bg-sale-badge',
      'data-added:text-white',
    ])
      expect(cta.classList.contains(cls), cls).toBe(true)
    // The name and the photograph still take the shopper to the product page.
    const toProduct = [...root.querySelectorAll('a')].filter(
      (a) => a.getAttribute('href') === `/product/${DEAL.slug}`,
    )
    expect(toProduct).toHaveLength(2)
  })

  it('gives the category link a 24px hit box (touch-targets.spec.ts measured 16)', async () => {
    const root = await dom(DEAL)
    const link = root.querySelector('a[href="/category/beauty-health"]') as HTMLAnchorElement
    expect(link).not.toBeNull()
    for (const cls of ['inline-flex', 'min-h-6', 'items-center'])
      expect(link.classList.contains(cls), cls).toBe(true)
  })

  it('wears the 12px elevated corner, not the 25px modal radius, on the card and the photograph', async () => {
    const root = await dom(DEAL)
    const card = root.querySelector('[data-deal-of-the-day]') as HTMLElement
    expect(card.classList.contains('rounded-elevated')).toBe(true)
    expect(root.innerHTML).not.toMatch(/rounded-lg/)
  })

  it('keeps the money integer: both prices formatted from agorot', async () => {
    const root = await dom(DEAL)
    const text = root.textContent ?? ''
    expect(text).toContain('250')
    expect(text).toContain('500')
    expect(text).not.toMatch(/25000|50000/)
  })
})
