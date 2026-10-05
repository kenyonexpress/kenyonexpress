import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { getClubStanding } from '@/server/queries/club'
import { NextResponse } from 'next/server'

/**
 * The signed-in customer's club tier, for the header's account menu.
 *
 * WHY A ROUTE AND NOT A PROP. `AccountMenu` is mounted by the shared header on
 * every prerendered route, and a session read there would opt the whole
 * header out of static rendering under `cacheComponents` (the comment on that
 * component). So the menu stays static and asks here, once, the first time it
 * opens. This is the only session-bound read the storefront header makes and
 * it happens on demand, not on page load.
 *
 * SIGNED OUT IS 200 `{ tier: null }`, NOT 401. The menu is also the sign-in
 * prompt for a visitor, and a 401 on every open would be a red line in every
 * visitor's console for a state that is not an error. `no-store` on both
 * shapes: the body is one person's standing.
 *
 * ONLY THE TIER ID AND ITS PROGRESS LEAVE. No spend figure: the dropdown shows
 * a badge, and the number belongs on /account behind the layout's own session
 * check, not in a JSON a browser extension can read off every page.
 */
async function handleGET(): Promise<NextResponse> {
  const headers = { 'Cache-Control': 'no-store' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ tier: null }, { headers })

  let standing: Awaited<ReturnType<typeof getClubStanding>>
  try {
    standing = await getClubStanding()
  } catch (cause) {
    // `orFail` inside the read has already logged `club.spend_read_failed`;
    // the menu shows no badge rather than a wrong one.
    log.warn('club.menu_read_failed', {
      message: cause instanceof Error ? cause.message : String(cause),
    })
    return NextResponse.json({ tier: null }, { status: 503, headers })
  }
  if (!standing) return NextResponse.json({ tier: null }, { headers })

  return NextResponse.json(
    {
      tier: standing.tier.id,
      nextTier: standing.nextTier?.id ?? null,
      progressPercent: standing.progressPercent,
    },
    { headers },
  )
}

export const GET = withRequestLog('/api/account/club', handleGET)
