import { log } from '@/lib/observability/log'
import { TABLE_MISSING } from '@/lib/reviews/reviews'
import { createClient } from '@/lib/supabase/server'

/**
 * Saved-search reads, always on the user client: RLS (245, owner-only) is the
 * boundary, and the auth check here only shapes the signed-out answer.
 * Degrades to empty until pending/245 is applied (PGRST205), the way the
 * wishlist reads do for 154.
 */

export interface SavedSearch {
  id: string
  name: string
  query: string
  href: string
  created_at: string
}

export async function getMySavedSearches(): Promise<SavedSearch[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('saved_searches' as never)
    .select('id, name, query, href, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code !== TABLE_MISSING) {
      log.warn('saved_searches.read_failed', { code: error.code ?? null })
    }
    return []
  }
  return (data ?? []) as unknown as SavedSearch[]
}

/**
 * Whether the signed-in user already saved `href` (canonical form), and under
 * which id. Null when signed out, unsaved, or the table is not applied yet;
 * the button renders the same "save" state for all three.
 */
export async function getMySavedSearchId(href: string): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('saved_searches' as never)
    .select('id')
    .eq('href', href)
    .maybeSingle()
  if (error || !data) return null
  return (data as unknown as { id: string }).id
}
