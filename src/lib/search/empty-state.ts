/**
 * What the results page offers when a query found nothing.
 *
 * Pure: the page fetches the promoted terms and passes the categories it
 * already loaded, and this decides what to show. Kept out of the component so
 * the ordering and the exclusions can be pinned by a unit test without
 * rendering.
 *
 * THREE WAYS OUT, in the order a shopper is likely to take them:
 *
 *   1. A relaxed query. Meilisearch has no "did you mean"; what it has is a
 *      typo budget, and a query that still found nothing usually asked for too
 *      much at once. Two words or more: drop the shortest, which is most often
 *      the modifier ("זוגי", "עם"). One word of four letters or more that
 *      starts with an attached prefix (ה ו ב ל מ ש כ): strip it, because
 *      "המסאז'" is "מסאז'" with a definite article the index does not carry.
 *   2. The promoted terms an operator curated (`popular_searches`), minus the
 *      one the shopper just typed.
 *   3. The categories, so a shopper can browse instead of guessing again.
 *
 * Nothing here is computed from other shoppers' queries: `search_events` is
 * analytics, not a suggestion list (see the note in api/search/quick-links).
 */

import { HEBREW_PREFIXES } from '@/lib/search/hebrew-synonyms'

export type PopularSearch = { term: string; target_url: string | null }
export type CategoryLink = { slug: string; name_he: string }

export type EmptyStateSuggestions = {
  /** A shorter query worth trying, or null when the query is already minimal. */
  relaxed: string | null
  terms: { term: string; href: string }[]
  categories: { slug: string; name_he: string; href: string }[]
}

export const MAX_EMPTY_TERMS = 6
export const MAX_EMPTY_CATEGORIES = 8
/** A word shorter than this keeps its prefix letter: "בית" is not "ית". */
const MIN_STRIP_LENGTH = 4

export function searchHref(term: string): string {
  return `/search?q=${encodeURIComponent(term)}`
}

/** A shorter query, or null when there is nothing sensible to drop. */
export function relaxQuery(query: string): string | null {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  if (words.length >= 2) {
    // Drop ONE occurrence of the shortest word; ties go to the last one, since
    // Hebrew puts the modifier after the noun.
    let shortest = 0
    words.forEach((w, i) => {
      if (w.length <= (words[shortest] as string).length) shortest = i
    })
    const kept = words.filter((_, i) => i !== shortest)
    const relaxed = kept.join(' ')
    return relaxed !== query.trim() ? relaxed : null
  }
  const word = words[0] as string
  if (
    word.length >= MIN_STRIP_LENGTH &&
    (HEBREW_PREFIXES as readonly string[]).includes(word[0] as string)
  ) {
    return word.slice(1)
  }
  return null
}

export function buildEmptyStateSuggestions(input: {
  query: string
  popular: PopularSearch[]
  categories: CategoryLink[]
}): EmptyStateSuggestions {
  const normalised = input.query.trim().toLowerCase()
  const terms = input.popular
    .filter((p) => p.term.trim().length > 0 && p.term.trim().toLowerCase() !== normalised)
    .slice(0, MAX_EMPTY_TERMS)
    .map((p) => ({ term: p.term, href: p.target_url ?? searchHref(p.term) }))
  const categories = input.categories
    .slice(0, MAX_EMPTY_CATEGORIES)
    .map((c) => ({ slug: c.slug, name_he: c.name_he, href: `/category/${c.slug}` }))
  return { relaxed: relaxQuery(input.query), terms, categories }
}
