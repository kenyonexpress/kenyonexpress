/**
 * Where a stored image path is actually served from.
 *
 * `products.images` holds same-origin paths (`/images/products/<file>`, 45 of
 * 82 rows on 2026-10-07) and the ingest ledger holds `/images/cdn/<key>`:
 * both are files under public/ that scripts/r2-promote re-homes to the
 * bucket under `products/<file>` and `<key>` respectively. Rewriting the
 * rows is a production SQL change that waits for approval; this is the
 * switch that does not. With NEXT_PUBLIC_R2_IMAGES=1 the image loader sends
 * the same stored paths through the signed proxy at /images/r2, so the
 * storefront serves from the bucket the moment the upload is verified, and
 * unsetting the flag is the whole rollback. After the rewrite lands the rows
 * carry the proxy path themselves and this becomes a no-op.
 *
 * Client-safe and pure: the flag is a NEXT_PUBLIC_ value inlined at build
 * time, which is what lets the loader run inside next/image on the client.
 */

export const R2_PROXY_PREFIX = '/images/r2/'
export const LOCAL_CDN_PREFIX = '/images/cdn/'
export const LOCAL_PRODUCTS_PREFIX = '/images/products/'
export const PRODUCTS_KEY_PREFIX = 'products/'

export function r2ImagesEnabled(
  flag: string | undefined = process.env.NEXT_PUBLIC_R2_IMAGES,
): boolean {
  return flag === '1'
}

export function resolveImageSrc(src: string, enabled: boolean = r2ImagesEnabled()): string {
  if (!enabled) return src
  if (src.startsWith(LOCAL_CDN_PREFIX)) return R2_PROXY_PREFIX + src.slice(LOCAL_CDN_PREFIX.length)
  if (src.startsWith(LOCAL_PRODUCTS_PREFIX)) {
    return `${R2_PROXY_PREFIX}${PRODUCTS_KEY_PREFIX}${src.slice(LOCAL_PRODUCTS_PREFIX.length)}`
  }
  return src
}
