import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import CategoryGrid from './CategoryGrid'

const tiles = vi.hoisted(() => ({
  current: [] as { slug: string; nameHe: string; imageUrl: string | null }[],
}))

vi.mock('@/lib/homepage/below-fold', () => ({
  getHomeCategoryTiles: async () => tiles.current,
}))

/**
 * UX07 (14.10.2026): the category tile card, held to what was measured on the
 * build of HEAD at 380 / 768 / 1440 (logs/ux07/before.json) and changed:
 *
 *   corner   `rounded-lg` resolved to --radius-lg, the 25px modal corner;
 *            now `rounded-elevated` (12px, ELECTRO.radius.elevated)
 *   hover    Tailwind's stock `shadow-md`, a value tokens.css forbids;
 *            now `shadow-card-hover`, the one Electro hover shadow
 *   zoom     the photograph scales 5% on hover inside a box clipped at the
 *            same corner (was unclipped)
 *   picture  every tile is a photograph; the label carries no emoji
 *
 * The rendered pixels (12px, the shadow value, scale 1.05, naturalWidth > 0)
 * are e2e/category-grid.spec.ts; this pins the classes those pixels come from.
 */
describe('CategoryGrid', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u

  it('renders nothing with no tiles', async () => {
    tiles.current = []
    expect(await CategoryGrid()).toBeNull()
  })

  it('cards carry the 12px corner, the token hover shadow and a clipped zooming photograph', async () => {
    tiles.current = [
      { slug: 'hot-deals', nameHe: 'דיל חם', imageUrl: '/images/products/rm5-600x600.webp' },
      { slug: 'pets', nameHe: 'ציוד ומזון לבעלי חיים', imageUrl: '/images/categories/pets.webp' },
    ]
    const html = renderToStaticMarkup(await CategoryGrid())
    const cards = html.match(/<a [^>]*data-category-tile="[^"]*"[^>]*>/g) ?? []
    expect(cards).toHaveLength(2)
    for (const card of cards) {
      expect(card).toMatch(/\brounded-elevated\b/)
      expect(card).toMatch(/\bhover:shadow-card-hover\b/)
      expect(card).toMatch(/\btransition-shadow\b/)
      expect(card).not.toMatch(/\bshadow-(sm|md|lg|xl)\b/)
      expect(card).not.toMatch(/\brounded-(lg|md|sm|xl)\b/)
    }
    // The photograph's box clips at the card's corner so the zoom cannot leak.
    const boxes = html.match(/<div class="relative aspect-square[^"]*"/g) ?? []
    expect(boxes).toHaveLength(2)
    for (const box of boxes) {
      expect(box).toMatch(/\boverflow-hidden\b/)
      expect(box).toMatch(/\brounded-elevated\b/)
    }
    const imgs = html.match(/<img [^>]*>/g) ?? []
    expect(imgs).toHaveLength(2)
    for (const img of imgs) {
      expect(img).toMatch(/\bgroup-hover:scale-105\b/)
      expect(img).toMatch(/\btransition-transform\b/)
      expect(img).toMatch(/\bobject-contain\b/)
      // Decorative: the label names the department.
      expect(img).toMatch(/\balt=""/)
    }
    expect(html).toContain('href="/category/hot-deals"')
    expect(html).toContain('href="/category/pets"')
  })

  it('prints the label it was given and never an emoji', async () => {
    tiles.current = [
      { slug: 'hot-deals', nameHe: 'דיל חם', imageUrl: '/images/products/rm5-600x600.webp' },
    ]
    const html = renderToStaticMarkup(await CategoryGrid())
    const label = html.match(/<span class="mt-2[^"]*">([^<]*)<\/span>/)?.[1]
    expect(label).toBe('דיל חם')
    expect(EMOJI.test(html)).toBe(false)
  })
})
