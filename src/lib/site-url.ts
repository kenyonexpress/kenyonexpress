/**
 * The site's absolute origin, with no trailing slash.
 *
 * `sitemap.ts` and `robots.ts` each carried their own copy of this three-line
 * function, and the feeds would have made it four. The trailing-slash strip is
 * the part that matters and the part a fourth copy would eventually omit: the
 * whole point of these files is emitting absolute URLs, and `//product/x` is a
 * protocol-relative URL to a host called `product`, which resolves for a
 * crawler and 404s for everyone.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  return raw.replace(/\/+$/, '')
}

/**
 * A site-relative path made absolute; an already-absolute URL returned as-is.
 *
 * MEASURED, NOT ANTICIPATED. The first build of the feeds served
 * `g:image_link>/images/products/bq-plate-3-600x600.webp`, and against
 * production that is **27 of the 46 active physical products** — nearly half
 * the Merchant feed, every one of them an item disapproval for an unfetchable
 * image. It looked correct at every layer above: the column holds that value,
 * `isAllowedImageUrl` accepts it (rightly — `next/image` serves it same-origin),
 * and the XML was well-formed. Only fetching the built feed showed it.
 */
export function absoluteUrl(site: string, value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  const base = site.replace(/\/+$/, '')
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`
}
