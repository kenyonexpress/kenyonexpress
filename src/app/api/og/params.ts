/**
 * What `/api/og` accepts, and (more importantly) what it refuses.
 *
 * THE ROUTE TAKES NO FREE TEXT, ON PURPOSE. The obvious shape for a share-image
 * generator is `?title=...&price=...`, and it is the shape that turns a branded
 * endpoint into a forgery kit: anybody can hand WhatsApp a kenyonexpress.co.il
 * URL that renders the site's yellow, the site's logo and any price they like.
 * The card would be indistinguishable from a real one because it IS a real one,
 * served by this origin.
 *
 * So every template takes a REFERENCE to a row (a product slug, a category
 * slug, a deal id) and every number on the card is read server-side through
 * the same cached loaders the pages themselves use. A crafted URL can only
 * render something the catalogue already says, and the card and the page it
 * links to cannot disagree.
 */

export const OG_TEMPLATES = ['product', 'category', 'deal', 'default'] as const

export type OgTemplate = (typeof OG_TEMPLATES)[number]

export interface OgRequest {
  template: OgTemplate
  /** Product or category slug. Null for `deal` and `default`. */
  slug: string | null
  /** Coupon deal id. Null for every other template. */
  id: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Slugs go straight into a `.eq()`, so the shape is pinned here rather than
 * trusted. PostgREST parameterises the value and a wild string would not
 * inject, but an unbounded one is still a cache key the caller chooses: every
 * distinct miss costs a database round trip and a Satori render.
 */
const SLUG_MAX = 120

/**
 * C0 controls, DEL and the C1 range.
 *
 * A loop and not a character class, because a regex naming these is exactly
 * what `lint/suspicious/noControlCharactersInRegex` exists to stop, and the
 * suppression comment would run longer than the loop. Codepoints rather than
 * code units: a lone surrogate is not a control character.
 */
function hasControlChar(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

function cleanSlug(raw: string | null): string | null {
  if (raw === null) return null
  let value = raw.trim()
  // Slugs arrive percent-encoded (Hebrew category slugs are the common case
  // here) and must be decoded before they can match the column. A malformed
  // escape sequence is not a slug at all.
  try {
    value = decodeURIComponent(value)
  } catch {
    return null
  }
  if (!value || value.length > SLUG_MAX) return null
  // A control character reaches Satori as an invisible glyph and the database
  // as a value no row has. Neither is worth carrying.
  if (hasControlChar(value)) return null
  return value
}

/**
 * An unreadable request is never an error: it is the default card.
 *
 * A 400 here renders as a BROKEN IMAGE beside a real link in a real chat, which
 * reads as a broken site. The worst thing this function can produce is the
 * generic brand card: exactly what the share would have carried if the page
 * had never asked for an image at all.
 */
export function parseOgRequest(url: URL): OgRequest {
  const raw = url.searchParams.get('t')
  const template = (OG_TEMPLATES as readonly string[]).includes(raw ?? '')
    ? (raw as OgTemplate)
    : 'default'

  const slug = cleanSlug(url.searchParams.get('slug'))
  const id = url.searchParams.get('id')

  if (template === 'product' || template === 'category') {
    return slug ? { template, slug, id: null } : { template: 'default', slug: null, id: null }
  }
  if (template === 'deal') {
    // The column is a uuid. Anything else cannot match a row, so it is refused
    // before it becomes a query rather than after.
    return UUID.test(id ?? '')
      ? { template, slug: null, id: id as string }
      : { template: 'default', slug: null, id: null }
  }
  return { template: 'default', slug: null, id: null }
}
