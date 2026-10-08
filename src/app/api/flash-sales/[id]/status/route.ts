import { CacheControl } from '@/lib/cache/http'
import { readFlashStatus } from '@/lib/flash-sales/status'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * The waiting room's poll (STEP 61): how many units are left, what phase the
 * sale is in, and the CALLER'S OWN claim. Never anyone else's: the user comes
 * from the session cookie, not from the query, so a caller can only ever ask
 * about themselves. A guest gets the aggregate and `claim: null`.
 *
 * Each poll sweeps the sale on the server (lapse, promote), which is what
 * hands a lapsed hold to the next shopper within one interval. That is a
 * write behind a GET, which is why it is rate limited per IP and never
 * shared-cached.
 */

const idSchema = z.string().uuid()

async function handleGET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ip = await getClientIp()
  const decision = await rateLimit('flash-status', ip)
  if (!decision.allowed) {
    const headers = new Headers(rateLimitHeaders(decision))
    headers.set('Cache-Control', CacheControl.private)
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers })
  }

  const { id } = await context.params
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_id' },
      { status: 400, headers: { 'Cache-Control': CacheControl.private } },
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const status = await readFlashStatus(parsed.data, user?.id ?? null)
  if (!status) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: { 'Cache-Control': CacheControl.private } },
    )
  }
  return NextResponse.json(status, { headers: { 'Cache-Control': CacheControl.private } })
}

export const GET = withRequestLog('/api/flash-sales/[id]/status', handleGET)
