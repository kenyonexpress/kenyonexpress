import { revalidateCacheTags } from '@/lib/cache/revalidate'
import { CacheTags } from '@/lib/cache/tags'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Nightly sitemap regeneration (STEP 37).
 *
 * `/sitemap.xml`, `/feed.xml` and `/merchant.xml` are `use cache` scopes on
 * the `sitemap` and `feed` tags with an hourly revalidate and a one-day
 * expire (lib/cache/tags.ts). The catalogue webhook stales them on a
 * URL-shaping write, so on a normal day nothing here is needed. This job is
 * the floor under that: a bulk import, a restored backup or a webhook outage
 * bypasses the trigger, and a deal applied by `daily-deals` at 03:00 changes
 * prices the feeds carry. It runs right after that job on the same slot.
 *
 * TWO STEPS, THE SECOND THE ONE THAT MATTERS. `revalidateTag(tag, 'max')`
 * only marks the entries stale; the next reader pays the render. For a file
 * only crawlers read, "the next reader" is Googlebot, and a cold render at
 * crawl time is the slow response that gets a sitemap fetched less often. So
 * after staling, the job fetches the sitemap itself, on the origin the
 * scheduler reached it through (NOT `siteUrl()`: the apex sits behind a bot
 * challenge that answers a busy client with a 403 page), so the warm copy is
 * in place before anyone else asks. The response is read, not trusted: an
 * empty or non-200 sitemap is a deindexing request, and this answers 500 so
 * the run is red rather than a quiet "ok" over an empty file.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET.
 */

/** Tags this job stales. The feeds share the sitemap's inputs and its slot. */
const TAGS = [CacheTags.sitemap, CacheTags.feed] as const

/** A warm fetch that takes longer than this is reported, not awaited forever. */
const WARM_TIMEOUT_MS = 25_000

/** `<loc>` occurrences in the warmed body: the only count that proves content. */
function countLocs(xml: string): number {
  return (xml.match(/<loc>/g) ?? []).length
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const revalidated = revalidateCacheTags(TAGS)

  const target = new URL('/sitemap.xml', request.nextUrl.origin)
  let status = 0
  let urls = 0
  try {
    const response = await fetch(target, {
      cache: 'no-store',
      headers: { 'user-agent': 'kenyonexpress-cron/sitemap-regen' },
      signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
    })
    status = response.status
    if (response.ok) urls = countLocs(await response.text())
  } catch (error) {
    log.error('sitemap_regen.warm_failed', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: false, revalidated, status, urls: 0 }, { status: 500 })
  }

  if (status !== 200 || urls === 0) {
    // An empty sitemap served with a 200 is the failure this job exists to
    // notice: the storefront still works and the index quietly empties.
    log.error('sitemap_regen.empty', { status, urls })
    return NextResponse.json({ ok: false, revalidated, status, urls }, { status: 500 })
  }

  log.info('sitemap_regen.warmed', { urls })
  return NextResponse.json({ ok: true, revalidated, status, urls })
}

export const GET = withRequestLog('/api/cron/sitemap-regen', handleGET)
