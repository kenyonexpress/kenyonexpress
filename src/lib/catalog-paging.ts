/**
 * The archive's paging preference (UX22): numbered pages, or continuous
 * loading where the next page is appended under the grid as the shopper
 * reaches its foot.
 *
 * A PLAIN MODULE, no directive, for the reason `lib/catalog-view.ts` gives:
 * a value exported from a `'use client'` file reaches a server component as
 * a client-reference proxy, not as a value. The grid (client), the pages
 * (server) and the tests all read these constants.
 *
 * Stored in `localStorage` and not in the URL, like the grid / list view:
 * the preference changes how THIS shopper walks the archive, not which
 * products it holds. The server always renders the numbered pages, so a
 * crawler, a shopper with storage disabled and the first client render all
 * see the same links (`docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md` §4.2: every
 * page past the first is a URL). The client switches after hydration;
 * `CatalogGrid` explains why that order is the only one that cannot produce
 * a hydration mismatch.
 */
export type CatalogPaging = 'pages' | 'scroll'

export const CATALOG_PAGINGS: readonly CatalogPaging[] = ['pages', 'scroll']

export const DEFAULT_CATALOG_PAGING: CatalogPaging = 'pages'

/** Versioned like `ke_catalog_view_v1`, so a future shape change can ignore old values. */
export const CATALOG_PAGING_KEY = 'ke_catalog_paging_v1'

/** The group's name and its two buttons, in Hebrew, for the switch and for its tests. */
export const CATALOG_PAGING_LEGEND = 'אופן הדפדוף'
export const CATALOG_PAGING_LABELS: Record<CatalogPaging, string> = {
  pages: 'עמודים',
  scroll: 'גלילה רציפה',
}

/** Anything that is not exactly `scroll` is the numbered pages, including a corrupt stored value. */
export function parseCatalogPaging(raw: unknown): CatalogPaging {
  return raw === 'scroll' ? 'scroll' : DEFAULT_CATALOG_PAGING
}

export function readStoredCatalogPaging(): CatalogPaging {
  try {
    return parseCatalogPaging(window.localStorage.getItem(CATALOG_PAGING_KEY))
  } catch {
    return DEFAULT_CATALOG_PAGING
  }
}

/** The default is stored as an absence, so a shopper who never chose leaves no key behind. */
export function writeStoredCatalogPaging(paging: CatalogPaging): void {
  try {
    if (paging === DEFAULT_CATALOG_PAGING) window.localStorage.removeItem(CATALOG_PAGING_KEY)
    else window.localStorage.setItem(CATALOG_PAGING_KEY, paging)
  } catch {
    // Storage disabled: the choice still holds for this page.
  }
}

/**
 * How far down the archive the shopper had loaded, per archive URL, in
 * `sessionStorage`.
 *
 * The one defect every continuous archive ships with is the back button: the
 * shopper loads three pages, opens a product, comes back, and the grid is
 * page one again with the scroll position pointing at nothing. The loaded
 * depth is written here after every append and read on mount, so the grid
 * refills to the same depth before the browser restores the scroll. Session
 * scope, because a new tab or a new visit should start at the top.
 */
export const SCROLL_DEPTH_KEY_PREFIX = 'ke_catalog_depth_v1:'

/** A ceiling on the refill, so a stale entry cannot fetch an archive's every page. */
export const RESTORE_MAX_PAGES = 10

export function scrollDepthKey(pathname: string, search: string): string {
  return `${SCROLL_DEPTH_KEY_PREFIX}${pathname}${search}`
}

export function readScrollDepth(key: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(key)
    const n = raw == null ? Number.NaN : Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 1 ? n : null
  } catch {
    return null
  }
}

export function writeScrollDepth(key: string, page: number): void {
  try {
    if (page > 1) window.sessionStorage.setItem(key, String(page))
    else window.sessionStorage.removeItem(key)
  } catch {
    // Storage disabled: the depth is forgotten on the way back, nothing worse.
  }
}

export function clearScrollDepth(key: string): void {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
