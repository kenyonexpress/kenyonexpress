/**
 * Old WordPress/WooCommerce paths -> new paths. Single source for the 301s that
 * `src/lib/seo/wp-legacy.ts` serves from `src/proxy.ts`. Pure data: no imports,
 * so it is safe in the edge runtime. A row in the `seo_redirects` table wins
 * over anything here (see docs/REDIRECTS.md).
 *
 * Paths are compared after normalisation (lowercase, no trailing slash).
 */

/** Exact old path -> new path. */
export const WP_EXACT_REDIRECTS: Readonly<Record<string, string>> = {
  '/shop': '/products',
  '/my-account': '/account',
  '/contact-us': '/contact',
  '/about-us': '/about',
  '/blog-2': '/blog',
  '/home': '/',
  '/index.php': '/',
  '/cart-2': '/cart',
  '/checkout-2': '/checkout',
  '/terms-and-conditions': '/terms',
  '/privacy-policy': '/privacy',
  '/refund_returns': '/returns',
  '/cancellation-policy': '/returns',
}

/**
 * Old prefix -> new prefix. The last segment of the old path (the slug) is
 * appended, or URL-encoded onto a `=` suffix. Product slugs keep
 * `/product/<slug>` and need no rule.
 */
export const WP_PREFIX_REDIRECTS: ReadonlyArray<readonly [from: string, to: string]> = [
  ['/product-category/', '/category/'],
  ['/product-tag/', '/search?q='],
]
