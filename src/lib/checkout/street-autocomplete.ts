import { normalizeCityQuery, resolveIsraeliCity } from '@/lib/geo/israeli-cities'

/**
 * Street suggestions for the checkout address (UX17), the pure halves.
 *
 * WHERE THE STREETS COME FROM. The Central Bureau of Statistics' street
 * registry, published on data.gov.il as a CKAN datastore (resource
 * 9ad3862c-8391-4b2f-84a4-2d4c68625f4b: סמל_ישוב, שם_ישוב, סמל_רחוב, שם_רחוב).
 * Public geographic fact, no key, no account. Measured on 14.10.2026 from this
 * machine: `plain=false` with an ANDed `to_tsquery` string and a `:*` prefix
 * on the last word answers "תל & אביב & דיז:*" with the three Dizengoff rows
 * of תל אביב - יפו and nothing else; a JSON `q` or `filters` object with
 * Hebrew keys is refused by the site's front door with an HTML error page.
 * So the request is one text query, and the answer is read defensively.
 *
 * WHY THE CITY GOES INTO THE SAME QUERY. The registry spells cities its own
 * way ("תל אביב - יפו", "מודיעין-מכבים-רעות") and the checkout city field is
 * free text, so an exact-match filter would miss the biggest city in the
 * country. The city's words are ANDed into the full-text query instead,
 * which narrows the registry to rows that mention them anywhere, and
 * `rankStreetSuggestions` then keeps only rows whose CITY contains every
 * typed city word and whose STREET starts with what was typed.
 *
 * WHAT A SUGGESTION IS NOT. A constraint. The field stays free text, exactly
 * as the city does: a street the registry does not know (a new one, a
 * moshav's single road, a typo the shopper means) is still typed and still
 * ships. The server lookup runs through `/api/checkout/streets`, which
 * rate-limits per IP and never answers with an error the form would show.
 */

export interface StreetLookupQuery {
  /** The city as typed (or picked) in the checkout, trimmed. */
  city: string
  /** What has been typed into the street field so far, trimmed. */
  prefix: string
}

export const STREET_SUGGESTION_LIMIT = 8
/** Shorter than this and the registry answers with half the country. */
export const MIN_STREET_PREFIX_LENGTH = 2
const MAX_FIELD_LENGTH = 80

/**
 * What two spellings of a street have to agree on. The same collapsing the
 * city matcher does (hyphen, maqaf, runs of spaces, the two quote glyphs),
 * plus the registry's own habit of writing "שד'" and "רח'" with a geresh.
 */
export function normalizeStreetName(value: string): string {
  return normalizeCityQuery(value).replace(/\s*'\s*/g, "'")
}

/**
 * A query the route will accept, or null when a field is missing or absurd.
 *
 * Both values are interpolated into a URL to a third party, so they are
 * trimmed, length-capped and refused outright on a control character. A
 * prefix under two characters is refused too: not an error the shopper
 * sees, just a request the form never makes.
 */
export function normalizeStreetLookupQuery(input: {
  city?: unknown
  prefix?: unknown
}): StreetLookupQuery | null {
  const read = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim().replace(/\s+/g, ' ')
    if (trimmed === '' || trimmed.length > MAX_FIELD_LENGTH) return null
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what is being refused
    if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null
    return trimmed
  }
  const city = read(input.city)
  const prefix = read(input.prefix)
  if (!city || !prefix) return null
  if (prefix.length < MIN_STREET_PREFIX_LENGTH) return null
  return { city, prefix }
}

/** Letters and digits only: what Postgres' parser turns into a lexeme. */
function tsWords(value: string): string[] {
  return value
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0)
}

/**
 * The city the registry is more likely to know the typed city as. The
 * matcher's aliases turn "ת"א" and "פ"ת" into their canonical names; the
 * registry's own suffixes ("- יפו") are not needed, since the words are ANDed
 * and a subset of a row's words still matches the row.
 */
function registryCityWords(city: string): string[] {
  const canonical = resolveIsraeliCity(city)?.name ?? city
  return tsWords(canonical)
}

/**
 * The `to_tsquery` text for one lookup: the city's words and the typed street
 * words, ANDed, with the last street word as a prefix. Null when the typed
 * street has no word a parser would keep (punctuation alone).
 */
export function streetTsQuery(query: StreetLookupQuery): string | null {
  const street = tsWords(query.prefix)
  if (street.length === 0) return null
  const last = street[street.length - 1] as string
  const terms = [...registryCityWords(query.city), ...street.slice(0, -1), `${last}:*`]
  return terms.join(' & ')
}

/**
 * The registry endpoint, with `{tsquery}` where the query goes. `limit=40`
 * because the ranking below drops rows the words matched in the wrong
 * column, and the eight that are offered must survive that.
 */
const REGISTRY_FIELDS = encodeURIComponent('שם_ישוב,שם_רחוב')
// One template literal, not a chain of `+`: the production build has been
// measured dropping text from concatenated template literals (see memory
// `template-literal-concat-corrupts-build`).
export const DEFAULT_STREET_LOOKUP_URL = `https://data.gov.il/api/3/action/datastore_search?resource_id=9ad3862c-8391-4b2f-84a4-2d4c68625f4b&limit=40&plain=false&fields=${REGISTRY_FIELDS}&q={tsquery}`

/**
 * The provider URL for one lookup, or null when the lookup is switched off.
 *
 * `ISRAEL_STREETS_LOOKUP_URL` is optional: unset means the public registry
 * above, `off` means no suggestions at all, and any other https URL is a
 * template with `{tsquery}` (the ANDed prefix query), `{city}` and `{q}` (the
 * two raw values) placeholders for a provider of one's own. An http URL is
 * refused rather than used, the same way the postal lookup refuses one.
 */
export function buildStreetLookupUrl(
  query: StreetLookupQuery,
  template: string | undefined = process.env.ISRAEL_STREETS_LOOKUP_URL,
): string | null {
  const configured = template?.trim()
  if (configured?.toLowerCase() === 'off') return null
  const base = configured || DEFAULT_STREET_LOOKUP_URL
  if (!/^https:\/\//i.test(base)) return null
  const tsquery = streetTsQuery(query)
  if (!tsquery) return null
  return base
    .replaceAll('{tsquery}', encodeURIComponent(tsquery))
    .replaceAll('{city}', encodeURIComponent(query.city))
    .replaceAll('{q}', encodeURIComponent(query.prefix))
}

export interface StreetRecord {
  /** The registry's city for the row, or null when the source has none. */
  city: string | null
  street: string
}

/** Does the registry's city contain every word of the typed city? */
export function cityMatchesRecord(typedCity: string, recordCity: string | null): boolean {
  if (recordCity === null) return true
  const wanted = registryCityWords(typedCity).map((word) => normalizeCityQuery(word))
  if (wanted.length === 0) return true
  const have = new Set(tsWords(normalizeCityQuery(recordCity)))
  return wanted.every((word) => have.has(word))
}

/**
 * The streets to offer for a query, from whatever rows came back.
 *
 * Kept: rows in the typed city whose street starts with the typed text
 * (score 0), then rows where every typed word is the start of some word of
 * the street, in any order (score 1: "בן יה" finds "בן יהודה" and a typed
 * "יהודה בן" still finds it). Dropped: rows the words matched in the city
 * column rather than the street, and duplicates of a street already offered.
 * Shorter names first inside a score, so "דיזנגוף" leads "ככר דיזנגוף".
 */
export function rankStreetSuggestions(
  records: readonly StreetRecord[],
  query: StreetLookupQuery,
  limit = STREET_SUGGESTION_LIMIT,
): string[] {
  const needle = normalizeStreetName(query.prefix)
  const needleWords = needle.split(' ').filter(Boolean)
  if (needle === '' || limit <= 0) return []

  const scored: { street: string; score: number }[] = []
  const seen = new Set<string>()
  for (const record of records) {
    const street = record.street.trim().replace(/\s+/g, ' ')
    if (street === '') continue
    if (!cityMatchesRecord(query.city, record.city)) continue
    const norm = normalizeStreetName(street)
    if (seen.has(norm)) continue
    const words = norm.split(' ')
    let score: number | null = null
    if (norm.startsWith(needle)) score = 0
    else if (needleWords.every((word) => words.some((w) => w.startsWith(word)))) score = 1
    if (score === null) continue
    seen.add(norm)
    scored.push({ street, score })
  }
  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.street.length - b.street.length ||
        a.street.localeCompare(b.street, 'he'),
    )
    .slice(0, limit)
    .map((row) => row.street)
}

function asRecord(value: unknown): StreetRecord | null {
  if (typeof value === 'string') return value.trim() ? { city: null, street: value } : null
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const street = row.שם_רחוב ?? row.street ?? row.name
  if (typeof street !== 'string' || street.trim() === '') return null
  const city = row.שם_ישוב ?? row.city
  return { city: typeof city === 'string' ? city : null, street }
}

/**
 * The street rows inside a provider answer, in the shapes a provider might
 * use: CKAN's `{ result: { records: [...] } }`, a bare `{ records }` or
 * `{ streets }`, or an array of rows or of names. Anything else, including a
 * body that is not JSON, is an empty list and never an error.
 */
export function parseStreetLookupResponse(body: string): StreetRecord[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return []
  }
  const rows: unknown = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? ((parsed as { result?: { records?: unknown } }).result?.records ??
        (parsed as { records?: unknown }).records ??
        (parsed as { streets?: unknown }).streets)
      : undefined
  if (!Array.isArray(rows)) return []
  return rows.map(asRecord).filter((row): row is StreetRecord => row !== null)
}
