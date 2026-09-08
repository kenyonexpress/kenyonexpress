import { readFileSync } from 'node:fs'
import { expandQueryWord } from '@/lib/search/db-expansion'
import { GOLDEN_ABSENCES, GOLDEN_QUERIES } from '@/lib/search/golden-queries'
import { describe, expect, it } from 'vitest'

/**
 * THE GOLDEN SET, AGAINST THE ENGINE THAT IS ACTUALLY RUNNING.
 *
 * `golden-queries.test.ts` replays the same journeys through a local matcher
 * built from the artefacts this repo ships to Meilisearch. That is worth having
 * and it is not this. No Meilisearch instance exists - MEILISEARCH_HOST appears
 * nowhere outside `.env.example` - so every shopper today is served by
 * `searchDb`, the ILIKE fallback, and nothing held that path to the same
 * journeys. `db-expansion.ts` was written after noticing exactly that, and even
 * then no test ran the golden set through it.
 *
 * This one does, and it found a journey that was failing:
 *
 *   קפה תל אביב -> coffee-tlv   ZERO RESULTS
 *
 * The deal is named "בית קפה — מאפה ושתייה" and sits in תל אביב. `קפה` matched
 * the name; neither `תל` nor `אביב` could match anything, because the query
 * searched `name_he` and `description_he` only. The words are ANDed, so the
 * shopper got nothing. Meanwhile `meili-settings.ts` ranks `city` ABOVE the
 * descriptions, with a comment naming this exact query shape.
 *
 * Fixed by searching `city` in `searchDb` too.
 */

/** The columns `searchDb` reads. Keep this list equal to the query's, or this
 *  harness stops describing the thing it claims to describe. */
type Row = { slug: string; name_he: string; description_he: string; city: string }

const ROWS: Row[] = [
  { slug: 'dinner-for-two', name_he: 'ארוחה זוגית מפנקת', description_he: '', city: 'ירושלים' },
  { slug: 'spa-day', name_he: 'יום ספא ועיסוי שוודי', description_he: '', city: 'חיפה' },
  {
    slug: 'gym-membership',
    name_he: 'מנוי חודשי לחדר כושר',
    description_he: 'אימונים ללא הגבלה',
    city: 'רמת גן',
  },
  { slug: 'gift-card-200', name_he: 'שובר מתנה 200 ש״ח', description_he: '', city: '' },
  {
    slug: 'weekend-getaway',
    name_he: 'סופ״ש נופש בצפון',
    description_he: 'לילה בצימר כולל קפה של בוקר',
    city: 'צפת',
  },
  { slug: 'coffee-tlv', name_he: 'בית קפה — מאפה ושתייה', description_he: '', city: 'תל אביב' },
]

/**
 * `searchDb`'s semantics, exactly: each typed word becomes one OR group over
 * its expanded spellings across the searched columns, and PostgREST ANDs the
 * groups. ILIKE is substring, so `includes` is the faithful model.
 */
function dbSearch(query: string): string[] {
  const words = query.split(' ').filter(Boolean).slice(0, 8)
  return ROWS.filter((row) =>
    words.every((word) =>
      expandQueryWord(word).some(
        (spelling) =>
          row.name_he.includes(spelling) ||
          row.description_he.includes(spelling) ||
          row.city.includes(spelling),
      ),
    ),
  ).map((row) => row.slug)
}

describe('every canonical journey works through the ILIKE path shoppers get', () => {
  for (const golden of GOLDEN_QUERIES) {
    it(`${golden.query} finds ${golden.expectSlug} - ${golden.reason}`, () => {
      expect(dbSearch(golden.query)).toContain(golden.expectSlug)
    })
  }
})

describe('and widening to city did not widen the lanes', () => {
  for (const absence of GOLDEN_ABSENCES) {
    it(`${absence.query} does not surface ${absence.absentSlug}`, () => {
      expect(dbSearch(absence.query)).not.toContain(absence.absentSlug)
    })
  }

  it('a bare city name returns that city, which is the point, not a bug', () => {
    // Adding `city` means "תל אביב" alone lists Tel Aviv deals. On a local
    // deals site that is the answer, not noise - but it IS a widening, so it
    // is written down rather than discovered later.
    expect(dbSearch('תל אביב')).toEqual(['coffee-tlv'])
  })
})

describe('the synonym map covers what a fourth column would', () => {
  /**
   * Checked 2026-09-08, and the hypothesis failed, which is why it is written
   * down. The gym fixture puts its text in `short_description_he` - a column
   * Meilisearch indexes and `searchDb` does not read - so a shopper typing
   * "אימונים" looked like a guaranteed miss on the path that actually serves.
   *
   * It is not. `expandQueryWord` maps אימונים onto כושר through the shipped
   * synonym map, and כושר is in the name. The expansion does the work the extra
   * column would have done, so adding the column would have been a change with
   * no failing journey behind it.
   */
  it('finds the gym deal from a word that lives only in its short description', () => {
    expect(dbSearch('אימונים')).toContain('gym-membership')
  })

  it('because the expansion reaches the name, not because of the column', () => {
    // The claim is about the MECHANISM, and the first version of this test got
    // it wrong: it asserted the fixture row carries the word in no searched
    // column, but this harness stores the gym text in `description_he`, so the
    // row proves nothing either way. What actually makes the match is that the
    // typed word expands onto a spelling the NAME contains.
    const spellings = expandQueryWord('אימונים')
    const gym = ROWS.find((row) => row.slug === 'gym-membership')
    expect(gym).toBeDefined()
    expect(spellings.some((spelling) => gym?.name_he.includes(spelling))).toBe(true)
  })
})

describe('the harness stays honest about what it models', () => {
  it('searches the same three columns the query does', () => {
    const source = readFileSync('src/lib/search-server.ts', 'utf8')
    for (const column of ['name_he.ilike', 'description_he.ilike', 'city.ilike']) {
      expect(source).toContain(column)
    }
  })
})
