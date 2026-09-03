import { describe, expect, it } from 'vitest'
import { GOLDEN_ABSENCES, GOLDEN_QUERIES } from './golden-queries'
import { buildSynonyms } from './hebrew-synonyms'
import { type ProductDocument, SEARCHABLE_ATTRIBUTES, toProductDocument } from './meili-settings'

/**
 * The offline golden-query harness (marathon step 9).
 *
 * There is no Meilisearch in CI and none in production yet, so the harness
 * runs the golden set against a LOCAL matcher assembled from the exact
 * artefacts this repo ships to the real engine: the synonym map
 * (buildSynonyms), the searchable-attribute order (SEARCHABLE_ATTRIBUTES)
 * and the document projection (toProductDocument). It deliberately imitates
 * only the two Meilisearch behaviours the golden set relies on -- word-prefix
 * matching and synonym expansion -- so it can never drift into being a
 * second search engine. What it buys: an edit to the synonyms, the attribute
 * order or the projection that breaks a canonical shopper journey breaks CI,
 * offline. The same set is the acceptance list to replay against the real
 * index when one exists.
 */

// ---------------------------------------------------------------------------
// Fixture catalogue: one document per golden journey, shaped by the real
// projection so the harness also notices a projection change.
// ---------------------------------------------------------------------------

const FIXTURES: ProductDocument[] = [
  toProductDocument(
    {
      id: '1',
      slug: 'dinner-for-two',
      name_he: 'ארוחה זוגית מפנקת',
      type: 'coupon',
      is_coupon_enabled: true,
      categories: { name_he: 'מסעדות', slug: 'restaurants' },
    },
    'הבישרו של רומא',
  ),
  toProductDocument(
    {
      id: '2',
      slug: 'spa-day',
      name_he: 'יום ספא ועיסוי שוודי',
      type: 'coupon',
      is_coupon_enabled: true,
      categories: { name_he: 'ספא וטיפוח', slug: 'spa' },
    },
    'ספא הרמוניה',
  ),
  toProductDocument(
    {
      id: '3',
      slug: 'gym-membership',
      name_he: 'מנוי חודשי לחדר כושר',
      short_description_he: 'אימונים ללא הגבלה',
      type: 'coupon',
      is_coupon_enabled: true,
      categories: { name_he: 'ספורט', slug: 'sport' },
    },
    'פיט סנטר',
  ),
  toProductDocument(
    {
      id: '4',
      slug: 'gift-card-200',
      name_he: 'שובר מתנה 200 ש״ח',
      type: 'coupon',
      is_coupon_enabled: true,
      categories: { name_he: 'שוברים', slug: 'gift-cards' },
    },
    'קניון אקספרס',
  ),
  toProductDocument(
    {
      id: '5',
      slug: 'weekend-getaway',
      name_he: 'סופ״ש נופש בצפון',
      description_he: 'לילה בצימר כולל קפה של בוקר',
      type: 'coupon',
      is_coupon_enabled: true,
      categories: { name_he: 'נופש', slug: 'vacation' },
    },
    'צימרים בגליל',
  ),
  toProductDocument(
    {
      id: '6',
      slug: 'coffee-tlv',
      name_he: 'בית קפה — מאפה ושתייה',
      type: 'coupon',
      is_coupon_enabled: true,
      categories: { name_he: 'בתי קפה', slug: 'cafes' },
    },
    'קפה דיזנגוף',
    'תל אביב',
  ),
]

// ---------------------------------------------------------------------------
// The local matcher: word-prefix containment over the searchable attributes,
// with query terms expanded through the shipped synonym map.
// ---------------------------------------------------------------------------

const SYNONYMS = buildSynonyms()

function words(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/[\s—-]+/).filter(Boolean)
  if (Array.isArray(value)) return value.flatMap(words)
  return []
}

/** Candidate spellings for one query token: itself plus its synonym group. */
function expansions(token: string): string[] {
  return [token, ...(SYNONYMS[token] ?? [])]
}

/** Does any word of any searchable attribute start with the candidate's first word? */
function attributeHit(doc: ProductDocument, candidate: string): number {
  const [head] = candidate.split(/\s+/)
  if (!head) return -1
  return SEARCHABLE_ATTRIBUTES.findIndex((attribute) =>
    words(doc[attribute as keyof ProductDocument]).some(
      (w) => w.startsWith(head) || head.startsWith(w),
    ),
  )
}

/** Best (lowest) attribute rank at which the doc matches ALL query tokens, or null. */
function matchRank(doc: ProductDocument, query: string): number | null {
  // A multi-word synonym KEY ("חדר כושר") is one term to Meilisearch, not
  // two: expand it as a whole before falling back to word tokens.
  const tokens = SYNONYMS[query] ? [query] : query.split(/\s+/)
  const ranks = tokens.map((token) => {
    const hits = expansions(token)
      .map((candidate) => attributeHit(doc, candidate))
      .filter((rank) => rank >= 0)
    return hits.length > 0 ? Math.min(...hits) : null
  })
  if (ranks.some((rank) => rank === null)) return null
  return Math.min(...(ranks as number[]))
}

function results(query: string): string[] {
  return FIXTURES.map((doc) => ({ doc, rank: matchRank(doc, query) }))
    .filter((r): r is { doc: ProductDocument; rank: number } => r.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.doc.slug)
}

// ---------------------------------------------------------------------------
// The set itself.
// ---------------------------------------------------------------------------

describe('golden queries: every canonical journey finds its deal', () => {
  it.each(GOLDEN_QUERIES.map((g) => [g.query, g.expectSlug, g.reason] as const))(
    '"%s" -> %s (%s)',
    (query, expectSlug) => {
      expect(results(query), `query "${query}"`).toContain(expectSlug)
    },
  )
})

describe('golden absences: synonyms stay in their lanes', () => {
  it.each(GOLDEN_ABSENCES.map((g) => [g.query, g.absentSlug, g.reason] as const))(
    '"%s" must not surface %s (%s)',
    (query, absentSlug) => {
      expect(results(query), `query "${query}"`).not.toContain(absentSlug)
    },
  )
})

describe('attribute order is a ranking, not a list', () => {
  it('a name hit outranks the same word buried in a description', () => {
    // קפה: coffee-tlv has it in name_he, weekend-getaway only in its
    // description. Reversing SEARCHABLE_ATTRIBUTES would flip this.
    const ranked = results('קפה')
    expect(ranked.indexOf('coffee-tlv')).toBeGreaterThanOrEqual(0)
    expect(ranked.indexOf('coffee-tlv')).toBeLessThan(ranked.indexOf('weekend-getaway'))
  })
})
