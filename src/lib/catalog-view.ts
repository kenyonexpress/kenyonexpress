/**
 * The listing page's grid / list preference (UX14).
 *
 * A PLAIN MODULE, no directive, for the reason `components/category/above-fold.ts`
 * spells out: a value exported from a `'use client'` file reaches a server
 * component as a client-reference proxy, not as a value. The constants here
 * are read by the provider (client), the control bar (client), the card
 * (client) and the tests, and the CSS reads the same two words off a
 * `data-view` attribute.
 *
 * Stored in `localStorage` and not in the URL: the view is a preference about
 * how THIS shopper likes to read a page, it changes nothing about which
 * products the page holds, and a `?view=list` would mint a second cache entry
 * and a second crawlable URL for every archive page for no new content. The
 * server always renders the grid and the client switches after hydration;
 * `CatalogViewProvider` explains why that order is the only one that cannot
 * produce a hydration mismatch.
 */
export type CatalogView = 'grid' | 'list'

export const CATALOG_VIEWS: readonly CatalogView[] = ['grid', 'list']

export const DEFAULT_CATALOG_VIEW: CatalogView = 'grid'

/** Versioned like `ke_delivery_city_v1`, so a future shape change can ignore old values. */
export const CATALOG_VIEW_KEY = 'ke_catalog_view_v1'

/** Button names, in Hebrew, for the switcher and for its tests. */
export const CATALOG_VIEW_LABELS: Record<CatalogView, string> = {
  grid: 'תצוגת רשת',
  list: 'תצוגת רשימה',
}

/** Anything that is not exactly `list` is the grid, including a corrupt stored value. */
export function parseCatalogView(raw: unknown): CatalogView {
  return raw === 'list' ? 'list' : DEFAULT_CATALOG_VIEW
}

export function readStoredCatalogView(): CatalogView {
  try {
    return parseCatalogView(window.localStorage.getItem(CATALOG_VIEW_KEY))
  } catch {
    return DEFAULT_CATALOG_VIEW
  }
}

/** The default is stored as an absence, so a shopper who never chose leaves no key behind. */
export function writeStoredCatalogView(view: CatalogView): void {
  try {
    if (view === DEFAULT_CATALOG_VIEW) window.localStorage.removeItem(CATALOG_VIEW_KEY)
    else window.localStorage.setItem(CATALOG_VIEW_KEY, view)
  } catch {
    // Storage disabled: the choice still holds for this page.
  }
}
