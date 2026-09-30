import 'server-only'
import { log } from '@/lib/observability/log'
import type { PopularSearch } from '@/lib/search/empty-state'
import { createClient } from '@/lib/supabase/server'

/**
 * The promoted search terms, for the results page's empty state.
 *
 * Read through the visitor's own client, not the service role: the table is
 * world-readable by policy (migration 118), so anon RLS answers it, and a page
 * component under src/app must not carry the admin client into a render tree
 * a future edit could move under `src/components` (admin-server-only.test.ts).
 *
 * A missing table, a policy change or a network fault is an empty list and a
 * warning, never an error on a page whose job is to help a shopper who already
 * found nothing.
 */
export const POPULAR_LIMIT = 8

export async function getPopularSearches(limit = POPULAR_LIMIT): Promise<PopularSearch[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('popular_searches')
      .select('term, target_url')
      .eq('is_active', true)
      .order('position', { ascending: true })
      .order('term', { ascending: true })
      .limit(limit)
    if (error) {
      log.warn('search.popular_failed', { reason: error.message })
      return []
    }
    return (data ?? []).map((row) => ({ term: row.term, target_url: row.target_url }))
  } catch (error) {
    log.warn('search.popular_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return []
  }
}
