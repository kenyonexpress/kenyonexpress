/**
 * The category scope a listing-page autocomplete sends with its query.
 *
 * A category slug as the catalogue spells them: lowercase ASCII, digits and
 * hyphens, capped well above the longest real one. Anything else is DROPPED
 * rather than answered with a 400, because a malformed scope must degrade to
 * an unscoped suggestion and never break typing.
 *
 * The same shape is what `search_products(category)` compares against
 * `categories.slug` (migration 171) and what the Meilisearch filter quotes, so
 * a value that passes here is a value in every engine and never structure.
 */
const CATEGORY_SLUG = /^[a-z0-9-]{1,64}$/

export function parseCategoryScope(raw: string | null | undefined): string | undefined {
  const value = raw?.trim() ?? ''
  return CATEGORY_SLUG.test(value) ? value : undefined
}
