import { WP_REDIRECTS, type WpRedirect } from './wp-redirects.generated'

/**
 * The retired WordPress URLs, as `redirects()` entries for next.config.ts.
 *
 * WHY HERE AS WELL AS IN `public.seo_redirects`
 *
 * The proxy already looks legacy paths up in the database (src/proxy.ts). That
 * lookup sits behind the maintenance gate and behind a Supabase read. The
 * router answers `redirects()` before the proxy runs, so these 301s need no
 * query and keep working during maintenance and during a database outage. The
 * table stays the home of the 410s, which a config redirect cannot express,
 * and of anything an operator adds later.
 *
 * `statusCode: 301`, NOT `permanent: true`. `permanent` is a 308 in Next, and
 * the hand-written aliases in next.config.ts use it on purpose. These are a
 * site migration: 301 is what the old URLs are being retired with in the
 * table, and one path answering 301 from the proxy and 308 from the config,
 * depending on which got there first, is a difference nobody chose.
 *
 * THREE SPELLINGS OF A HEBREW SOURCE
 *
 * The router matches the request path as it arrives, percent-encoded. A
 * Hebrew source written as Hebrew therefore never matches a real request. The
 * encoded spelling does, and Next compiles sources case-insensitively, so
 * `%D7%A9` and WordPress's own lower-case `%d7%a9` both hit it.
 *
 * The lower-case and raw spellings are emitted anyway. The deployed router is
 * Vercel's, built from this list by a different compiler, and whether IT is
 * case-insensitive on hex digits is not something to find out from a search
 * result that stopped working. Three rows cost nothing; lower-case hex is the
 * exact form in Google's index.
 */

export type NextRedirect = {
  source: string
  destination: string
  statusCode: 301
}

const encodeLower = (path: string) =>
  encodeURI(path).replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase())

/** Every spelling of `path` a client can send. One entry for plain ASCII. */
export function sourceSpellings(path: string): string[] {
  return [...new Set([encodeURI(path), encodeLower(path), path])]
}

export function toNextRedirects(rows: readonly WpRedirect[] = WP_REDIRECTS): NextRedirect[] {
  return rows.flatMap((row) =>
    sourceSpellings(row.source).map((source) => ({
      source,
      // Encoded: a Location header is ASCII, and a raw Hebrew destination
      // leaves the encoding to whichever layer writes the header.
      destination: encodeURI(row.destination),
      statusCode: 301 as const,
    })),
  )
}
