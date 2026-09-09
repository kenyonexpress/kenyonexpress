import { agorot } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { israeliDay } from '@/lib/pricing/price-history'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { backInStockDedupeKey, priceDropDedupeKey, priceDropVerdict } from '@/lib/wishlist/alerts'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The two mails that make a wishlist worth having.
 *
 * A saved product that gets cheaper, or comes back into stock, is the entire
 * reason a shopper saved it — and until this route the shop knew both facts and
 * said nothing.
 *
 * NEITHER ALERT INVENTS DATA. The price comparison reads `price_history` (193)
 * and the restock reads `stock_waitlist` (195); both are tables written by
 * other jobs, and this one only decides who to tell.
 *
 * IT ENQUEUES, IT DOES NOT SEND. Every row goes into `notification_outbox` with
 * a dedupe key, and `/api/cron/notifications` drains it — so these mails get
 * the same retry, the same backoff and the same idempotency as every other
 * notification, rather than a second delivery path with its own rules. That is
 * the mistake the abandoned-cart nudge already makes (`docs/EMAILS.md`), and
 * repeating it would make "what has this system mailed" a three-table question.
 *
 * EVERY MISSING TABLE IS TOLERATED SEPARATELY. 193, 195 and 200 are three
 * unapplied migrations, and this route runs correctly with none, some or all of
 * them: each read that 42P01s contributes zero alerts and the run reports what
 * it could not do. A cron that 500s nightly because a migration is unapproved
 * teaches everybody to ignore it.
 */

/** One run's ceiling per alert kind. A backlog drains over consecutive runs. */
const BATCH = 200

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204'])
const isMissing = (error: { code?: string | null } | null) =>
  Boolean(error?.code && MISSING.has(error.code))

type Enqueued = { sent: number; skipped: string | null }

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = israeliDay()

  const priceDrops = await runPriceDrops(admin, today)
  const restocks = await runRestocks(admin)

  log.info('wishlist_alerts.done', {
    price_drops: priceDrops.sent,
    price_drops_skipped: priceDrops.skipped,
    restocks: restocks.sent,
    restocks_skipped: restocks.skipped,
  })

  return NextResponse.json({ ok: true, priceDrops, restocks })
}

/**
 * A saved product that is cheaper than it was on the day it was saved.
 *
 * The baseline is the price on the SAVE date, read out of `price_history`, and
 * not yesterday's price. "It is cheaper than when you saved it" is a sentence
 * the customer can act on; "cheaper than yesterday" is about a price they never
 * saw, and it turns a three-week drift into fifteen tiny mails.
 */
async function runPriceDrops(
  admin: ReturnType<typeof createAdminClient>,
  today: string,
): Promise<Enqueued> {
  const { data: saved, error } = await admin
    .from('wishlists' as never)
    .select('user_id, product_id, created_at, products!inner(name_he, slug, status, deleted_at)')
    .eq('products.status', 'active')
    .is('products.deleted_at', null)
    .limit(BATCH)

  if (error) {
    if (isMissing(error)) return { sent: 0, skipped: 'wishlists table absent' }
    log.warn('wishlist_alerts.wishlist_read_failed', { reason: error.message })
    return { sent: 0, skipped: error.message }
  }

  const rows = (saved ?? []) as unknown as {
    user_id: string
    product_id: string
    created_at: string
    products: { name_he: string | null; slug: string | null }
  }[]
  if (rows.length === 0) return { sent: 0, skipped: null }

  const productIds = [...new Set(rows.map((r) => r.product_id))]

  // Today's price and the price on each save date, in one read of the history
  // rather than one per row. The window is bounded by the oldest save date in
  // the batch.
  const oldest = rows.reduce(
    (min, row) => (row.created_at < min ? row.created_at : min),
    rows[0]?.created_at ?? today,
  )
  const { data: history, error: historyError } = await admin
    .from('price_history' as never)
    .select('product_id, observed_on, price_agorot')
    .in('product_id', productIds)
    .gte('observed_on', israeliDay(new Date(oldest)))
    .eq('status', 'active')

  if (historyError) {
    if (isMissing(historyError)) return { sent: 0, skipped: 'price_history absent (193)' }
    log.warn('wishlist_alerts.history_read_failed', { reason: historyError.message })
    return { sent: 0, skipped: historyError.message }
  }

  // Lowest observation per product per day, matching `checkReferencePrice`: a
  // day may carry several rows and the lowest is the price a shopper could
  // actually have paid.
  const byProductDay = new Map<string, number>()
  for (const row of (history ?? []) as unknown as {
    product_id: string
    observed_on: string
    price_agorot: number
  }[]) {
    const key = `${row.product_id}:${row.observed_on}`
    const seen = byProductDay.get(key)
    if (seen === undefined || row.price_agorot < seen) byProductDay.set(key, row.price_agorot)
  }

  // The recipient's address, in one read.
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds)

  // Read, not discarded. A failed profile read renders as "nobody has an email
  // address", which produces a silent run of zero alerts that reports success
  // -- exactly the shape `discarded-read-inventory` exists to catch. Reported
  // and abandoned: sending to a partial address list is worse than sending to
  // none, because the customers who were missed are invisible.
  if (profilesError) {
    log.warn('wishlist_alerts.profiles_read_failed', { reason: profilesError.message })
    return { sent: 0, skipped: profilesError.message }
  }
  const contacts = new Map(
    ((profiles ?? []) as { id: string; email: string | null; full_name: string | null }[]).map(
      (p) => [p.id, p],
    ),
  )

  let sent = 0
  for (const row of rows) {
    const contact = contacts.get(row.user_id)
    if (!contact?.email) continue

    const savedDay = israeliDay(new Date(row.created_at))
    const savedAt = byProductDay.get(`${row.product_id}:${savedDay}`)
    const now = byProductDay.get(`${row.product_id}:${today}`)
    if (now === undefined) continue

    const verdict = priceDropVerdict({
      savedAtAgorot: savedAt === undefined ? null : agorot(savedAt),
      nowAgorot: agorot(now),
    })
    if (!verdict.alert) continue

    const { error: enqueueError } = await admin.rpc('fn_enqueue_notification', {
      p_kind: 'price_drop',
      p_email: contact.email,
      p_dedupe: priceDropDedupeKey(row.user_id, row.product_id, now),
      p_payload: {
        customer_name: contact.full_name,
        product_name: row.products.name_he,
        product_slug: row.products.slug,
        saved_agorot: verdict.savedAgorot,
        now_agorot: verdict.nowAgorot,
      },
    })

    if (enqueueError) {
      // 23514 is 200 being unapplied: the outbox does not accept `price_drop`
      // yet. Reported once for the whole run rather than per row.
      const unaccepted = enqueueError.code === '23514'
      log[unaccepted ? 'warn' : 'error']('wishlist_alerts.price_drop_enqueue_failed', {
        reason: enqueueError.message,
      })
      return {
        sent,
        skipped: unaccepted ? 'price_drop kind not accepted (200)' : enqueueError.message,
      }
    }
    sent++
  }

  return { sent, skipped: null }
}

/**
 * Everyone still waiting on a product that is back on the shelf.
 *
 * `notified_at` is set BEFORE the run ends and only for rows that enqueued
 * successfully, so a failure halfway leaves the rest still due. Marking first
 * and enqueuing after would lose a mail on any error; enqueuing and never
 * marking would send it every ten minutes forever.
 */
async function runRestocks(admin: ReturnType<typeof createAdminClient>): Promise<Enqueued> {
  const { data: waiting, error } = await admin
    .from('stock_waitlist' as never)
    .select('id, email, product_id, products!inner(name_he, slug, stock_quantity, status)')
    .is('notified_at', null)
    .eq('products.status', 'active')
    .gt('products.stock_quantity', 0)
    .limit(BATCH)

  if (error) {
    if (isMissing(error)) return { sent: 0, skipped: 'stock_waitlist absent (195)' }
    log.warn('wishlist_alerts.waitlist_read_failed', { reason: error.message })
    return { sent: 0, skipped: error.message }
  }

  const rows = (waiting ?? []) as unknown as {
    id: string
    email: string
    product_id: string
    products: { name_he: string | null; slug: string | null }
  }[]

  let sent = 0
  for (const row of rows) {
    const { error: enqueueError } = await admin.rpc('fn_enqueue_notification', {
      p_kind: 'back_in_stock',
      p_email: row.email,
      p_dedupe: backInStockDedupeKey(row.id),
      p_payload: {
        product_name: row.products.name_he,
        product_slug: row.products.slug,
      },
    })

    if (enqueueError) {
      const unaccepted = enqueueError.code === '23514'
      log[unaccepted ? 'warn' : 'error']('wishlist_alerts.restock_enqueue_failed', {
        reason: enqueueError.message,
      })
      return {
        sent,
        skipped: unaccepted ? 'back_in_stock kind not accepted (200)' : enqueueError.message,
      }
    }

    // Only after the enqueue succeeded. The other order loses a mail on any
    // error; not marking at all sends it on every run forever.
    await admin
      .from('stock_waitlist' as never)
      .update({ notified_at: new Date().toISOString() } as never)
      .eq('id', row.id)

    sent++
  }

  return { sent, skipped: null }
}

export const GET = withRequestLog('/api/cron/wishlist-alerts', handleGET)
