import { CacheControl } from '@/lib/cache/http'
import { isBannerEventKind, isMissingBannerSchema } from '@/lib/category-banners/rules'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * The banner counter (STEP 62): one impression or one click on one category
 * banner. The body is `{ kind: 'impression' | 'click' }` and nothing else;
 * the counter is an aggregate per banner per day with no visitor identifier,
 * which is why this needs no consent and stores nothing a person could be
 * found by.
 *
 * The write goes through `record_category_banner_event` on the SERVICE ROLE.
 * The function is granted to no client role (267), so this route is the only
 * door, and the door is rate limited per IP: a banner is shown at most once
 * per page view, so sixty a minute is a generous ceiling for a human and a
 * low one for a loop.
 *
 * Always 204, except over the ceiling and on a malformed request. An unknown
 * or switched-off banner is also 204: the function answers false and this
 * route does not tell a probe which ids exist. `private, no-store`, because a
 * 204 to a POST must never be served from a shared cache.
 */

const idSchema = z.string().uuid()
const bodySchema = z.object({ kind: z.string() })

async function handlePOST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ip = await getClientIp()
  const decision = await rateLimit('banner-event', ip)
  if (!decision.allowed) {
    const headers = new Headers(rateLimitHeaders(decision))
    headers.set('Cache-Control', CacheControl.private)
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers })
  }

  const { id } = await context.params
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json(
      { error: 'bad_id' },
      { status: 400, headers: { 'Cache-Control': CacheControl.private } },
    )
  }

  let kind: unknown
  try {
    const body = bodySchema.safeParse(await request.json())
    kind = body.success ? body.data.kind : undefined
  } catch {
    kind = undefined
  }
  if (!isBannerEventKind(kind)) {
    return NextResponse.json(
      { error: 'bad_kind' },
      { status: 400, headers: { 'Cache-Control': CacheControl.private } },
    )
  }

  const { error } = await createAdminClient().rpc(
    'record_category_banner_event' as never,
    { p_banner: parsedId.data, p_kind: kind } as never,
  )
  if (error && !isMissingBannerSchema(error)) {
    // Best effort: a counter that fails must not fail the page that fired it.
    log.warn('category_banners.event_write_failed', { kind, reason: error.message })
  }

  return new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': CacheControl.private },
  })
}

export const POST = withRequestLog('/api/category-banners/[id]/events', handlePOST)
