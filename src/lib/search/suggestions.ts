// Shape of the masthead suggestions dropdown, kept apart from the /search page.
//
// A suggestion is not a small search result. The dropdown is read in the
// half-second between keystrokes, so it carries the least that still lets
// someone decide: the name, the price they would pay, and the link. No image,
// no category, no stock. Sending the full ProductCard payload for a dropdown
// meant shipping fields nothing in it renders, on every keystroke.

/** Longest query we will run. Past this it is a paste, not a search. */
export const MAX_SUGGESTION_QUERY = 64
/** Shortest query worth a round trip. One Hebrew letter matches everything. */
export const MIN_SUGGESTION_QUERY = 2
export const SUGGESTION_LIMIT = 6

export type Suggestion = {
  id: string
  slug: string
  name_he: string
  price: number | null
  type: 'coupon' | 'physical' | null
}

export type SuggestionResponse = {
  query: string
  suggestions: Suggestion[]
}

/**
 * Whether a raw query is worth sending. Exported so the input and the route
 * agree on the rule instead of each keeping its own copy: the client one stops
 * the request, the server one stops the query, and a disagreement between them
 * is a request that always returns nothing.
 */
export function isSuggestibleQuery(raw: unknown): boolean {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value.length >= MIN_SUGGESTION_QUERY && value.length <= MAX_SUGGESTION_QUERY
}

export function normalizeSuggestionQuery(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value.slice(0, MAX_SUGGESTION_QUERY)
}
