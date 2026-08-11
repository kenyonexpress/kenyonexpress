import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * What the search box offers before a single character is typed: the terms an
 * operator chose to promote, and - for a signed-in shopper - their own last few
 * searches.
 *
 * TWO LISTS FROM ONE ROUTE, BECAUSE THEY ARE ONE UI. The dropdown shows both
 * together and a second round trip would make one of them arrive late and shift
 * the list under the shopper's finger.
 *
 * THE POPULAR LIST IS CURATED, NOT COMPUTED. Ranking `search_events` by count
 * and showing the top of it means publishing whatever a handful of people typed
 * - typos, competitor names, the occasional obscenity - in the header of every
 * page. An operator picks these from the analytics; the analytics are not the
 * list.
 *
 * THE RECENT LIST IS READ THROUGH THE SHOPPER'S OWN SESSION, not the admin
 * client. `user_recent_searches` is owner-only by RLS, and reading it with the
 * service role here would move the ownership check out of the database and into
 * this file, where a future edit can lose it.
 *
 * NEVER CACHED PUBLICLY. Half the payload is one person's search history.
 */

const POPULAR_LIMIT = 8
const RECENT_LIMIT = 5

async function handleGET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The popular list is world-readable by policy, but it is read with the admin
  // client so a logged-out visitor gets it without the anon client's RLS round
  // trip on every keystroke-triggered open.
  const admin = createAdminClient()
  const popularQuery = admin
    .from('popular_searches')
    .select('term, target_url')
    .eq('is_active', true)
    .order('position', { ascending: true })
    .order('term', { ascending: true })
    .limit(POPULAR_LIMIT)

  const recentQuery = user
    ? supabase
        .from('user_recent_searches')
        .select('term, searched_at')
        .order('searched_at', { ascending: false })
        .limit(RECENT_LIMIT)
    : null

  const [popularResult, recentResult] = await Promise.all([
    popularQuery,
    recentQuery ?? Promise.resolve({ data: [], error: null }),
  ])

  // A missing table (a deployment without 118) is an empty list, not a 500. The
  // search box must keep working.
  const popular = (popularResult.data ?? []) as { term: string; target_url: string | null }[]
  const recent = (recentResult.data ?? []) as { term: string }[]

  return NextResponse.json(
    { popular, recent: recent.map((row) => row.term) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export const GET = withRequestLog('/api/search/quick-links', handleGET)
