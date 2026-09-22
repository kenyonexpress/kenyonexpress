import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { CONTACT_CHANNELS_TAG } from '@/lib/contact/channels'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { revalidateTag } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * On-demand cache invalidation for writers that are not a Server Action.
 *
 * `src/lib/catalogue-cache.ts` already solved this for the admin panel:
 * every write path there calls `updateTag(CATALOGUE_TAG)` directly, which
 * expires the entry before the response is even sent. That is strictly
 * better than this route and this route does not replace it -- `updateTag`
 * is only callable from a Server Action, and an admin save always is one.
 *
 * What is NOT a Server Action: a Vercel Cron job, an external pipeline, or
 * anything else that reaches Supabase over its own connection and never
 * passes through a `'use server'` boundary. `price-schedule`'s cron route
 * is the existing example -- it calls `revalidateTag(CATALOGUE_TAG, 'hours')`
 * inline because it happens to already be a route handler with the tag
 * hardcoded. This route exists so that pattern does not get reinvented once
 * per caller: one shared endpoint, one table-to-tag map, the same
 * `CRON_SECRET` bearer auth every other cron route already uses (see
 * `src/lib/security/constant-time.ts` on why `!==` on the secret is a bug
 * and not a style choice). The first real caller is the Phase 3 deals
 * pipeline: a cron job inserts rows with the Supabase admin client, which
 * is not a Server Action either, and needs exactly this to make the new
 * rows visible without waiting for `cacheLife('hours')` to expire on its
 * own.
 *
 * `revalidateTag` and not `updateTag`, on purpose: a route handler cannot
 * call `updateTag` at all, so this is not a choice between the two, it is
 * the only one available here. The cost, same as `price-schedule`'s, is
 * that the FIRST request after this call still serves the old value while
 * it refills -- seconds, not the hour it would otherwise be.
 *
 * TABLE, NOT TAG, IN THE REQUEST BODY. A caller sends the table it wrote,
 * not the cache tag, and `TABLE_TAGS` below is the only place that mapping
 * lives. An unlisted table is refused with 400 rather than silently
 * accepted as a no-op tag, because a typo in a table name should look like
 * a typo, not like a successful revalidation that revalidated nothing.
 */

const TABLE_TAGS: Record<string, string> = {
  products: CATALOGUE_TAG,
  categories: CATALOGUE_TAG,
  // Phase 3 (DEALS_AUTOPILOT): approved rows land in `deals` and are read
  // through the same catalogue cache the storefront grids already use.
  deals: CATALOGUE_TAG,
  contact_channels: CONTACT_CHANNELS_TAG,
  page_contact_config: CONTACT_CHANNELS_TAG,
}

const bodySchema = z.object({
  table: z.string().min(1),
})

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'expected { table: string }' }, { status: 400 })
  }

  const { table } = parsed.data
  const tag = TABLE_TAGS[table]
  if (!tag) {
    return NextResponse.json(
      { ok: false, error: `table "${table}" is not wired to a cache tag` },
      { status: 400 },
    )
  }

  revalidateTag(tag, 'hours')
  log.info('revalidate.on_demand', { table, tag })
  return NextResponse.json({ ok: true, table, tag })
}

export const POST = withRequestLog('/api/revalidate', handlePOST)
