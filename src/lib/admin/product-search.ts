import { sanitizeOrTerm } from '@/lib/utils/search-escape'

/**
 * The PostgREST `.or()` expression behind the admin product list's search box.
 *
 * It matched `name_he` only, so a catalogue number typed into the box found
 * nothing, and the only way to reach a product by SKU was to know its name.
 * A term now matches the name, the SKU or the slug.
 *
 * Returns null when nothing searchable is left after sanitising, so the caller
 * adds no filter instead of an `ilike.%%` that matches every row. The term goes
 * through `sanitizeOrTerm` because `,`, `(` and `)` are structural in an `.or()`
 * string and a raw term could append conditions of its own.
 */
export function adminProductSearchFilter(term: string | undefined | null): string | null {
  const safe = sanitizeOrTerm(term ?? '')
  if (!safe) return null
  return ['name_he', 'sku', 'slug'].map((column) => `${column}.ilike.%${safe}%`).join(',')
}
