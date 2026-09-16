import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { enqueueJob } from '@/lib/jobs'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import {
  type DealCandidate,
  applyDueScheduledPriceChanges,
  rankDeals,
} from '@/lib/pricing/flash-deals'
import { jerusalemDayKey, snapshotPrices } from '@/lib/pricing/price-snapshot'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { offloadTask } from '@/lib/workers/async-offload'
import { revalidateTag } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The daily deal scrape, from our own catalogue.
 *
 * "SCRAPE" USED TO MEAN THE LIVE SITE AND CANNOT ANY MORE. The deals grid was
 * captured off kenyonexpress.co.il's WordPress install, and that host now
 * serves THIS build (scripts/live-reference.mjs, measured 2026-09-09). A job
 * that fetched it would be photographing ourselves. So the daily scrape is
 * the thing the live site actually gave us, taken from the database it now
 * lives in: what every product costs today, which of them is a deal, and
 * which scheduled price changes fell due.
 *
 * THREE STEPS, IN THIS ORDER.
 *
 *   1. Apply due flash deals (`scheduled_price_changes`, migration 201). First,
 *      so that steps 2 and 3 observe and rank the prices the day actually
 *      opens with.
 *   2. Snapshot every product's price into `price_history` (193). This is the
 *      observation the thirty-day "was it really charged" check reads, and
 *      the reason the job runs even on a day with no deals: a day with no
 *      observation is a hole nothing can fill later. Idempotent with the
 *      04:45 snapshot `wishlist-alerts` also takes.
 *   3. Rank today's deal set and journal it. The set is NOT written to the
 *      home page: `DealsOfTheDay` renders the 32 reference cards by design,
 *      because the comparison gate measures that grid against the capture and
 *      a set that changes daily cannot be measured. The set is logged under
 *      `daily_deals.set` and returned, which is what an operator or a later
 *      consumer reads.
 *
 * THE CACHE IS INVALIDATED OR THE DEAL IS INVISIBLE. Product pages and grids
 * are cached under `CATALOGUE_TAG`; a price that moved without invalidation
 * would be live for up to an hour before anybody could see it. `revalidateTag`
 * with the documented two-argument form; the single-argument one is
 * deprecated in this Next.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET.
 */

/** Products read per run; the catalogue is 46 today and the cap is a guard. */
const MAX_PRODUCTS = 2000

/** The pages the nightly invalidation empties and a visitor lands on first. */
const WARM_PATHS = ['/', '/products', '/category/hot-deals', '/search'] as const

async function warmCatalogue(): Promise<void> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  if (!/^https:\/\//.test(base)) return
  const outcome = await offloadTask(
    { type: 'warm-urls', urls: WARM_PATHS.map((path) => `${base}${path}`) },
    {
      inline: async () => {
        const result = await enqueueJob('cache-warm', { paths: [...WARM_PATHS] })
        return result.transport === 'qstash' ? `queued ${result.messageId}` : result.outcome
      },
    },
  )
  log.info('daily_deals.warm', outcome)
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const today = jerusalemDayKey(now)

  // ---- 1. flash deals whose moment has come ------------------------------
  let applied: Awaited<ReturnType<typeof applyDueScheduledPriceChanges>>
  try {
    applied = await applyDueScheduledPriceChanges(admin, { now, today })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    log.error('daily_deals.schedule_read_failed', { reason })
    return NextResponse.json({ ok: false, error: reason }, { status: 500 })
  }
  if (applied.applied > 0) {
    revalidateTag(CATALOGUE_TAG, 'max')
    log.info('daily_deals.flash_deals_applied', {
      applied: applied.applied,
      failed: applied.failed,
      productIds: applied.productIds,
    })
    // The invalidation above empties every catalogue page at once, and the
    // next visitor to each would pay the cold render. The warm goes to the
    // Cloudflare Worker when one is configured (one signed POST, answered in
    // milliseconds, the fan-out runs there); otherwise to the job queue,
    // which itself runs inline without QStash. Never awaited into a failure:
    // a cold cache is a slow page, not a wrong deal.
    await warmCatalogue()
  }

  // ---- 2. today's observation --------------------------------------------
  const { data, error } = await admin
    .from('products')
    .select('id, slug, name_he, status, stock_quantity, kenyon_price_agorot, full_price_agorot')
    .is('deleted_at', null)
    .limit(MAX_PRODUCTS)
  if (error) {
    log.error('daily_deals.products_read_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  const products = (data ?? []) as unknown as DealCandidate[]
  const snapshot = await snapshotPrices(admin, products, today, 'daily_deals')

  // ---- 3. the day's set --------------------------------------------------
  const deals = rankDeals(products)
  log.info('daily_deals.set', {
    day: today,
    count: deals.length,
    top: deals.slice(0, 5).map((d) => ({ id: d.id, slug: d.slug, discountBp: d.discountBp })),
  })

  return NextResponse.json({
    ok: applied.failed === 0,
    day: today,
    flashDeals: { due: applied.due, applied: applied.applied, failed: applied.failed },
    snapshot,
    deals: { count: deals.length, items: deals },
  })
}

export const GET = withRequestLog('/api/cron/daily-deals', handleGET)
