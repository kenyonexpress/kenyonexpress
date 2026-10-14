import type { CategoryProduct } from '@/components/category/CategoryProductCard'

/**
 * What the two archives (`/category/[slug]` and `/products`) and the JSON
 * page route behind continuous loading (UX22) share: how a page number and a
 * price bound are read off the URL, how a page window is computed, and the
 * live WooCommerce wording of the result count.
 *
 * Both pages carried their own identical copies of these four functions
 * since phase 4. The route that serves the next page to the grid has to
 * parse the URL EXACTLY as the page does, or the page the shopper scrolls
 * into is not the page the link would have opened; one module is how the
 * three stay one parser.
 *
 * A plain module: `CatalogGrid` (client) reads `resultCountText` and
 * `archivePageUrl`, the pages (server) read the parsers.
 */

export function parsePage(raw: string | string[] | undefined): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : 1
  return Number.isFinite(n) && n >= 1 ? n : 1
}

export function parsePrice(raw: string | string[] | undefined): number | undefined {
  if (typeof raw !== 'string') return undefined
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/* Live WooCommerce result-count wording */
export function resultCountText(total: number, from: number, to: number): string {
  if (total === 1) return 'מציג תוצאה יחידה'
  if (to - from + 1 >= total) return `מציגים את כל ⁦${total}⁩ התוצאות`
  return `מציג ${from}–${to} מתוך ${total} תוצאות`
}

export function pageWindow(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const from = (currentPage - 1) * pageSize + 1
  const to = Math.min(currentPage * pageSize, total)
  return { totalPages, currentPage, from, to }
}

/** One card's worth of the JSON page: the row plus the blur manifest's entry for its thumb. */
export type ArchivePageItem = CategoryProduct & {
  blur?: string
  dimensions?: { w: number; h: number }
}

export type ArchivePageResponse = {
  items: ArchivePageItem[]
  total: number
  page: number
  totalPages: number
  pageSize: number
}

export const ARCHIVE_PAGE_ENDPOINT = '/api/catalog/page'

/**
 * The route's URL for page `page` of the archive the shopper is on.
 *
 * Every query string the archive honours (sort, the price bounds, type,
 * city, brand, discount, near) is carried through as-is, so the next page is
 * filtered and ordered exactly as the one on screen; `page` is replaced. A
 * `/category/<slug>` pathname becomes the route's `slug` parameter and
 * `/products` sends none, which is how the route tells the two archives
 * apart.
 */
export function archivePageUrl(pathname: string, search: string, page: number): string {
  const params = new URLSearchParams(search)
  params.delete('page')
  params.delete('slug')
  const segment = /^\/category\/([^/?#]+)/.exec(pathname)?.[1]
  if (segment) {
    let slug = segment
    try {
      slug = decodeURIComponent(slug)
    } catch {
      // A malformed escape stays as typed; the route answers 404 for it.
    }
    params.set('slug', slug)
  }
  params.set('page', String(page))
  return `${ARCHIVE_PAGE_ENDPOINT}?${params.toString()}`
}
