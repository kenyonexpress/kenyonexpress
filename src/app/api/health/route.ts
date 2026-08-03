import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * Liveness plus one real dependency check, for an uptime monitor.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It reports no version, no commit, no env
 * var names and no error strings from the database. This route is
 * unauthenticated by necessity -- a monitor cannot hold a session -- so
 * everything it returns is public, and the useful shape of a health endpoint
 * for an attacker is a free inventory of what you run and what is currently
 * broken. `ok` plus a coarse reason is all a pager needs.
 *
 * The database probe is a HEAD count against `categories`: a table that always
 * has rows, is safe to read, and is not on the money path. `head: true` sends
 * no rows back, so the check stays cheap enough to run every thirty seconds.
 * It goes through the admin client on purpose -- an anon read would be
 * measuring RLS as much as reachability, and a policy change would then look
 * like an outage.
 *
 * Never cached: a cached health check is a lie with a timestamp.
 */
export async function GET() {
  const startedAt = performance.now()

  let database: 'ok' | 'down' = 'ok'
  try {
    const { error } = await createAdminClient()
      .from('categories')
      .select('id', { count: 'exact', head: true })
    if (error) database = 'down'
  } catch {
    database = 'down'
  }

  const ok = database === 'ok'

  return NextResponse.json(
    {
      ok,
      database,
      // Round to whole milliseconds. Sub-millisecond precision on a public
      // endpoint is a timing side channel for no operational gain.
      latency_ms: Math.round(performance.now() - startedAt),
    },
    {
      // 503 rather than 200-with-a-flag, so a monitor that only reads the
      // status line still pages.
      status: ok ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  )
}
