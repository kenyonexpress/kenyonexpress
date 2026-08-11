import { adminAlertDedupeKey, adminAlertRecipient } from '@/lib/email/admin-alerts'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Two stock chores, in this order and never merged.
 *
 * 1. RELEASE LAPSED HOLDS. This is bookkeeping, NOT the thing that frees the
 *    stock: an expired reservation stops counting against availability the
 *    moment it lapses, because `available_stock` filters on `expires_at >
 *    now()`. The ordering matters and is the point - a cron that failed to run
 *    for a day must not be able to keep a product sold out. What this buys is a
 *    table that says `released_at` instead of one full of rows that look live
 *    and are not.
 *
 * 2. ALERT ON LOW STOCK. Read from `v_low_stock`, which compares AVAILABLE
 *    against the per-product threshold rather than the raw level: a product
 *    whose last three units are all inside live checkouts is out of stock for
 *    the next shopper, and telling an operator otherwise is telling them
 *    nothing.
 *
 * DEDUPED PER PRODUCT PER DAY. The alert is keyed on the product and the
 * calendar date, so a product that sits under its threshold for a week produces
 * seven emails rather than one every time this route runs. Keyed on the day
 * rather than "once ever" because the situation is ongoing and worth repeating,
 * unlike the dead-invoice alert, which is one event.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */

/** Rows alerted on per run. A larger backlog carries to the next day's run. */
const ALERT_LIMIT = 25

type LowStockRow = {
  id: string
  name_he: string | null
  slug: string | null
  stock_quantity: number | null
  available: number | null
  low_stock_threshold: number | null
  supplier_name: string | null
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: released, error: releaseError } = await admin.rpc(
    'release_expired_stock_reservations',
  )
  if (releaseError) {
    log.error('stock.release_expired_failed', { reason: releaseError.message })
  }

  const { data: rows, error: lowError } = await admin
    .from('v_low_stock')
    .select('id, name_he, slug, stock_quantity, available, low_stock_threshold, supplier_name')
    .order('available', { ascending: true })
    .limit(ALERT_LIMIT)

  if (lowError) {
    // The release above already committed. Say so, so a 500 is not read as
    // "nothing happened".
    log.error('stock.low_stock_read_failed', { reason: lowError.message })
    return NextResponse.json(
      { ok: false, released: released ?? 0, alerted: 0, error: lowError.message },
      { status: 500 },
    )
  }

  const lowRows = (rows ?? []) as unknown as LowStockRow[]
  // The calendar day in Israeli local time, so "today" means what an operator
  // in Israel means by it rather than what UTC does at 02:00.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  let alerted = 0

  for (const row of lowRows) {
    const { error } = await admin.rpc('fn_enqueue_notification', {
      p_kind: 'low_stock',
      p_email: adminAlertRecipient(),
      p_dedupe: adminAlertDedupeKey('low_stock', `${row.id}:${today}`),
      p_payload: {
        product_id: row.id,
        product_name: row.name_he,
        slug: row.slug,
        available: row.available,
        stock_quantity: row.stock_quantity,
        threshold: row.low_stock_threshold,
        supplier_name: row.supplier_name,
      },
    })
    // `ON CONFLICT (dedupe_key) DO NOTHING` inside the function means a repeat
    // within the same day is a no-op, not an error, so this counts attempts
    // rather than sends.
    if (error)
      log.warn('stock.low_stock_alert_failed', { productId: row.id, reason: error.message })
    else alerted++
  }

  return NextResponse.json({ ok: true, released: released ?? 0, low: lowRows.length, alerted })
}

export const GET = withRequestLog('/api/cron/stock', handleGET)
