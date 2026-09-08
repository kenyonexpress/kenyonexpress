import { HEBREW_PREFIXES, SYNONYM_GROUPS } from '@/lib/search/hebrew-synonyms'

/**
 * Hebrew query expansion for the STAGE-1 DATABASE SEARCH.
 *
 * WHY THIS EXISTS. `hebrew-synonyms.ts` is imported by exactly one non-test
 * module: `meili-settings.ts`. Meilisearch is stage 3 and no instance is
 * configured - `MEILISEARCH_HOST` is set nowhere outside `.env.example` - so
 * every shopper today is served by `searchDb`, the ILIKE fallback, which had
 * no synonyms and no morphology at all.
 *
 * That left `golden-queries.test.ts` green while proving something about an
 * engine nobody is running. Measured against production on 2026-09-08:
 *
 *   query      hits   why
 *   חיתולים       0   the catalogue says חיתולי (construct form)
 *   מסאז          1   only because one name happens to spell it that way
 *   המסעדה        0   the ה- prefix is part of the LIKE pattern
 *
 * WHAT THIS DOES NOT NEED TO DO. It does not need the prefixed SPELLINGS that
 * `buildSynonyms` generates for Meilisearch. Those exist because Meilisearch
 * matches whole tokens; ILIKE matches substrings, so a pattern `%מסעדה%`
 * already matches a product whose text reads המסעדה or ובמסעדה. The
 * product-side prefixes are free here.
 *
 * The direction that is NOT free is the query side: a shopper who types
 * המסעדה produces the pattern `%המסעדה%`, which does not match a product
 * that says מסעדה. So the prefix is stripped off the TYPED word instead of
 * being generated onto the targets. That is one extra term per word rather
 * than the seven `withHebrewPrefixes` would add, and it is the term that
 * actually helps.
 *
 * Net effect: a typical word expands to about eight patterns instead of the
 * fifty-six a naive reuse of `buildSynonyms` would produce, which matters
 * because every one of them becomes a clause in a PostgREST `or=` group and
 * that group travels in a URL.
 */

/**
 * A word must keep at least this many letters after a prefix is removed.
 *
 * Below it the stripped form is noise: מתנה minus מ is תנה, and a three-letter
 * ILIKE pattern matches a large slice of any Hebrew catalogue. Same threshold
 * `withHebrewPrefixes` uses when deciding a word is long enough to prefix.
 */
const MIN_STEM_LENGTH = 3

/** Cheap membership test; the groups are small and this runs per query word. */
const BASE_TERMS: readonly string[] = [...new Set(SYNONYM_GROUPS.flat())]

/**
 * The synonym group a term belongs to, matched against the term itself and
 * against its de-prefixed form.
 *
 * Returns base terms ONLY - never their prefixed spellings - for the reason in
 * the module comment.
 */
function synonymsFor(word: string): string[] {
  const out = new Set<string>()
  for (const group of SYNONYM_GROUPS) {
    if (!group.includes(word)) continue
    for (const other of group) if (other !== word) out.add(other)
  }
  return [...out]
}

/**
 * The typed word with a single leading Hebrew prefix removed, when removing one
 * leaves a real stem AND the stripped form is a term we know about.
 *
 * The "term we know about" condition is what stops this being the general
 * prefix stripper `hebrew-synonyms.ts` explicitly refuses to write: it will
 * turn המסעדה into מסעדה because מסעדה is in a group, and it will leave משהו
 * and ברזל alone because שהו and רזל are not.
 */
export function stripKnownPrefix(word: string): string | null {
  if (word.length < MIN_STEM_LENGTH + 1) return null
  const first = word[0] as string
  if (!(HEBREW_PREFIXES as readonly string[]).includes(first)) return null
  const stem = word.slice(1)
  if (stem.length < MIN_STEM_LENGTH) return null
  return BASE_TERMS.includes(stem) ? stem : null
}

/**
 * Every ILIKE pattern one typed word should match on.
 *
 * Always includes the word itself first, so a query can never return FEWER
 * results than it did before expansion - the original pattern is still in the
 * set. That property is what makes this safe to turn on without re-measuring
 * every existing query, and `db-expansion.test.ts` pins it.
 */
export function expandQueryWord(word: string): string[] {
  const trimmed = word.trim()
  if (!trimmed) return []

  const out = new Set<string>([trimmed])

  const stem = stripKnownPrefix(trimmed)
  if (stem) {
    out.add(stem)
    for (const synonym of synonymsFor(stem)) out.add(synonym)
  }

  for (const synonym of synonymsFor(trimmed)) out.add(synonym)

  return [...out]
}
