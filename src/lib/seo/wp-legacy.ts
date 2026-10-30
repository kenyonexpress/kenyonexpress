import { WP_EXACT_REDIRECTS, WP_PREFIX_REDIRECTS } from '../../../docs/redirects.map'
import { normalizePath } from './normalize-path'

/**
 * Structural WordPress / WooCommerce URL shapes, resolved without a database.
 *
 * The `seo_redirects` table holds the per-URL map written by the import
 * pipeline. This is the backstop under it: the URL SHAPES the old store always
 * used, which are known without reading a single row. If the table is empty,
 * unreachable, or lacks a row for a category that was added late, these still
 * answer with a 301 instead of a 404.
 *
 * Product slugs keep their path (`/product/<slug>`), so they need no rule.
 * The lookup in the proxy runs first; a table row wins over anything here.
 */

/** The new path for an old WordPress path, or null if it is not a legacy shape. */
export function wpLegacyTarget(pathname: string): string | null {
  const path = normalizePath(pathname)
  const exact = WP_EXACT_REDIRECTS[path]
  if (exact) return exact

  for (const [from, to] of WP_PREFIX_REDIRECTS) {
    if (!path.startsWith(from)) continue
    // Woo nests categories (/product-category/a/b/); the leaf is the slug here.
    const leaf = path.slice(from.length).split('/').filter(Boolean).pop()
    if (!leaf) return null
    return `${to}${to.endsWith('=') ? encodeURIComponent(leaf) : leaf}`
  }
  return null
}
