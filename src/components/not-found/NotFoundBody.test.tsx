import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NotFoundBody, {
  NOT_FOUND_CATEGORY_COUNT,
  NOT_FOUND_HEADING,
  notFoundMetadata,
} from './NotFoundBody'

const tiles = vi.hoisted(() => ({
  current: [] as { slug: string; nameHe: string; imageUrl: string | null }[],
  reads: 0,
}))

vi.mock('@/lib/homepage/below-fold', () => ({
  getHomeCategoryTiles: async () => {
    tiles.reads += 1
    return tiles.current
  },
}))

// The real field is a client combobox on next/navigation; here only its
// mount matters: which id it gets, and that it is in the body at all.
vi.mock('@/components/search/SiteSearch', () => ({
  default: ({ id, variant }: { id: string; variant: string }) => (
    <input type="search" id={id} data-variant={variant} aria-label="stub" />
  ),
}))

function tile(n: number) {
  return { slug: `cat-${n}`, nameHe: `קטגוריה ${n}`, imageUrl: `/images/categories/${n}.webp` }
}

/**
 * UX25: the 404 body, held to what was missing before (logs/ux25/before.json):
 * a search field, category links, and a body that is not a second <main>.
 */
describe('NotFoundBody', () => {
  it('is RTL, not a <main>, and leads with the heading the E2E suites look for', async () => {
    tiles.current = []
    const { container } = render(await NotFoundBody())
    const root = container.querySelector('[data-not-found]')
    expect(root).not.toBeNull()
    expect(root).toHaveAttribute('dir', 'rtl')
    expect(root?.tagName).toBe('DIV')
    expect(container.querySelector('main')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(NOT_FOUND_HEADING)
    expect(NOT_FOUND_HEADING).toBe('הדף שחיפשתם לא נמצא')
  })

  it('mounts the site search with its own fixed id', async () => {
    tiles.current = []
    render(await NotFoundBody())
    const field = screen.getByRole('searchbox')
    expect(field).toHaveAttribute('id', 'not-found-search')
    expect(field).toHaveAttribute('data-variant', 'page')
  })

  it('offers the home page first, then the catalogue and contact, each on the 44px floor', async () => {
    tiles.current = []
    render(await NotFoundBody())
    const nav = screen.getByRole('navigation', { name: 'דרכים להמשיך' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/products', '/contact'])
    expect(links[0]).toHaveTextContent('לדף הבית')
    expect(links[0]?.className).toContain('bg-brand-primary')
    for (const a of links) expect(a.className).toContain('min-h-touch-min')
  })

  it('shows up to six of the home page category tiles as links, under a labelled section', async () => {
    tiles.current = Array.from({ length: 8 }, (_, i) => tile(i + 1))
    render(await NotFoundBody())
    const section = screen.getByRole('region', { name: 'קטגוריות פופולריות' })
    expect(section).toHaveAttribute('data-not-found-categories')
    const links = within(section).getAllByRole('link')
    expect(links).toHaveLength(NOT_FOUND_CATEGORY_COUNT)
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => `/category/cat-${n}`),
    )
    const first = links[0]
    if (!first) throw new Error('no tile rendered')
    expect(first).toHaveTextContent('קטגוריה 1')
    // The home grid's card: the 12px corner, the token hover shadow, a photograph.
    expect(first.className).toContain('rounded-elevated')
    expect(first.className).toContain('hover:shadow-card-hover')
    const img = within(first).getByRole('presentation', { hidden: true })
    expect(decodeURIComponent(img.getAttribute('src') ?? '')).toContain('/images/categories/1.webp')
  })

  it('stands without tiles: the reader answering nothing drops the section, not the page', async () => {
    tiles.current = []
    render(await NotFoundBody())
    expect(screen.queryByRole('region', { name: 'קטגוריות פופולריות' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toHaveAttribute('href', '/')
  })

  it('compact: no search, no tiles, no read, for the admin, supplier and auth layouts', async () => {
    tiles.current = [tile(1)]
    tiles.reads = 0
    render(await NotFoundBody({ compact: true }))
    expect(tiles.reads).toBe(0)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('region', { name: 'קטגוריות פופולריות' })).toBeNull()
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toHaveAttribute('href', '/')
  })

  it('carries the brand mark and asks search engines not to index', async () => {
    tiles.current = []
    const { container } = render(await NotFoundBody())
    const mark = container.querySelector('[data-not-found-mark]')
    expect(mark).toHaveAttribute('aria-hidden', 'true')
    expect(mark?.className).toContain('bg-brand-primary')
    expect(mark).toHaveTextContent('404')
    expect(notFoundMetadata.robots).toMatchObject({ index: false, follow: true })
  })
})
