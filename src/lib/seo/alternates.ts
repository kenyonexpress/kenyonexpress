import type { Metadata } from 'next'

/**
 * The `alternates` block for a page, built rather than written out.
 *
 * WHY THIS EXISTS. Next.js merges `metadata` from layout to page FIELD BY
 * FIELD at the top level, and `alternates` is one field. A page that writes
 *
 *     alternates: { canonical: '/products' }
 *
 * therefore REPLACES the root layout's entire alternates object, not just its
 * canonical - and silently drops everything else the root put there.
 *
 * Measured on 2026-09-08 against a production build: the root layout defines
 * `languages: { 'he-IL': '/' }` and `types: { 'application/rss+xml': ... }`,
 * and the served homepage carried NEITHER. The only `<link rel="alternate">`
 * in the head was absent entirely; canonical survived only because the page
 * happened to set it. Sixteen route files set `alternates.canonical`, so
 * sixteen routes lost their hreflang and their feed link, and nothing failed:
 * every page still rendered, still had a canonical, and still passed the
 * suite.
 *
 * So the fix is not "remember to repeat those two keys sixteen times", which
 * is the version that drifts. Pages call this and pass the one thing that
 * genuinely differs.
 */

/**
 * The feed link, identical on every page.
 *
 * `robots.txt` advertises the sitemap and has no field for a feed, and nothing
 * in the page body links to one, so without this tag `/feed.xml` exists and is
 * undiscoverable. Deliberately NOT the Merchant feed: that one is pulled from a
 * URL configured inside Merchant Center and has no business being offered to
 * browsers.
 */
const FEED_URL = '/feed.xml'
const FEED_TITLE = 'קניון אקספרס — דילים חדשים'

/**
 * Built fresh per call rather than shared as a frozen constant: Next types
 * `types` as a MUTABLE `AlternateLinkDescriptor[]`, so `as const` makes it
 * readonly and unassignable. A new array per page costs nothing and cannot be
 * mutated by one route into another route's tag.
 */
const feedTypes = () => ({
  'application/rss+xml': [{ url: FEED_URL, title: FEED_TITLE }],
})

/**
 * @param canonical Path for this page, root-relative and without a trailing
 *   slash (`/products`, `/product/abc`). `'/'` for the homepage.
 *
 * The hreflang entry points at the SAME path rather than at `/`. Google
 * requires a self-reference from any page carrying hreflang, and a page whose
 * only hreflang pointed at the homepage would be declaring the homepage as its
 * Hebrew alternate - which is a different page.
 *
 * One language, so one entry and no `x-default`. The site exists in Hebrew;
 * `he-IL` states the region as well, which `<html lang="he">` leaves open, and
 * the region is what tells a search engine which market this catalogue prices
 * for. Every price on it is in ILS. The day a second language ships, this gains
 * a row per language and an `x-default`.
 */
export function alternatesFor(canonical: string): Metadata['alternates'] {
  return {
    canonical,
    languages: { 'he-IL': canonical },
    types: feedTypes(),
  }
}
