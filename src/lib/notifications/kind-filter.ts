import {
  CATEGORY_KINDS,
  type Category,
  KNOWN_KINDS,
  type KindExclusion,
} from '@/lib/notifications/categories'

/**
 * Turning a shelf or a mute into a PostgREST predicate on `kind`.
 *
 * Both readers of `notifications` (the bell's first paint and the center's
 * list) and the two writers of `read_at` (mark one, mark all) narrow by the
 * same two things: what the customer has muted, and which tab they are on. One
 * pair of functions, so the badge and the list cannot disagree about what is
 * hidden.
 *
 * `system` is a fallback shelf with no kind list of its own, so its predicate
 * is the complement of every named shelf. Kinds are `[a-z_]+` by the outbox
 * CHECK, so the comma-joined list PostgREST wants needs no quoting.
 */

/**
 * The narrow surface of a PostgREST filter builder these helpers touch.
 *
 * The builder is reached through a cast and not a generic bound: the tables
 * are read as `'notifications' as never` (they are outside the generated
 * types), and a bound of `T extends KindFilterable<T>` over that builder is
 * the "excessively deep" instantiation tsc refuses. Each method returns the
 * same builder, which is all the callers rely on.
 */
export interface KindFilterable {
  in(column: string, values: readonly string[]): unknown
  not(column: string, operator: string, value: string): unknown
}

function listOf(kinds: readonly string[]): string {
  return `(${kinds.join(',')})`
}

export function applyKindExclusion<T>(query: T, exclusion: KindExclusion): T {
  const q = query as unknown as KindFilterable
  if (exclusion.only) return q.in('kind', exclusion.only) as T
  if (exclusion.hide.length > 0) return q.not('kind', 'in', listOf(exclusion.hide)) as T
  return query
}

export function applyCategoryFilter<T>(query: T, category: Category): T {
  const q = query as unknown as KindFilterable
  if (category === 'system') return q.not('kind', 'in', listOf(KNOWN_KINDS)) as T
  return q.in('kind', CATEGORY_KINDS[category]) as T
}
