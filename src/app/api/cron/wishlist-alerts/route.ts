import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  backInStockDedupeKey,
  detectPriceDrop,
  isInStock,
  previousObservedPrice,
  priceDropDedupeKey,
  waitlistDedupeKey,
} from '@/lib/wishlist/alerts'
import { createUnsubscribeToken } from '@/lib/wishlist/unsubscribe-token'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The producer that 200 promised: price-drop and back-in-stock alerts for the
 * wishlist, daily, into `notification_outbox`. The drain at
 * `/api/cron/notifications` sends the mail and 231's trigger rings the bell;
 * this route only decides WHO is owed WHAT today.
 *
 * IT ALSO WRITES THE DAILY PRICE SNAPSHOT. 193's header names "the snapshot
 * cron" as the writer of `price_history` and no such cron was ever built, so
 * the table has held the apply-day backfill and nothing since. The snapshot
 * is not a side quest here: the price-drop comparison is between two of that
 * table's rows, so the feature and the record it needs arrive together. The
 * unique observation index makes a re-run a no-op.
 *
 * FOUR STEPS, EACH USEFUL WITHOUT THE NEXT:
 *
 *   1. snapshot today's prices into `price_history` (append-only, idempotent);
 *   2. compare each WISHLISTED product against its previous observed day and
 *      queue `price_drop` for owners who have not turned it off;
 *   3. compare current stock against `wishlist_stock_state`, queue
 *      `back_in_stock` for owners on a false-to-true flip, and store the new
 *      flags (first run only seeds the table: a transition needs a "before");
 *   4. drain `stock_waitlist`: whoever pressed "tell me" while it was gone
 *      gets the same mail, waitlist rows are stamped `notified_at`.
 *
 * DEGRADES, NEVER HALF-RUNS. 233 may not be applied yet: a missing
 * `wishlist_alert_prefs` reads as "defaults for everyone" (drops on,
 * restocks on: the same answer an absent row gives), and a missing
 * `wishlist_stock_state` skips step 3 entirely rather than alerting blind.
 *
 * DEDUPE IS THE OUTBOX'S UNIQUE KEY, so a double run cannot double-mail:
 * a price floor mails once per user, a restock once per user per day, a
 * waitlist row once ever (`lib/wishlist/alerts.ts` owns the key shapes).
 *
 * Direct outbox INSERT rather than `fn_enqueue_notification`, for the same
 * reason gift-vouchers.ts does it: the RPC cannot carry `user_id`, and a row
 * without one never rings 231's bell. The RPC's suppression check is
 * reproduced here by dropping suppressed addresses before enqueueing.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */

/** Missing table, PostgREST's code for it and Postgres's own. */
const TABLE_MISSING = new Set(['PGRST205', '42P01'])

/** Ceilings per run. A bigger backlog carries to tomorrow's run. */
const MAX_PRODUCTS = 1000
const MAX_ALERTS = 500

type ProductRow = {
  id: string
  name_he: string | null
  slug: string | null
  status: string | null
  stock_quantity: number | null
  kenyon_price_agorot: number | null
  full_price_agorot: number | null
}

type PrefsRow = {
  user_id: string
  price_drop: boolean
  back_in_stock: boolean
}

type OutboxInsert = {
  kind: 'price_drop' | 'back_in_stock'
  recipient_email: string
  user_id: string | null
  dedupe_key: string
  payload: Record<string, unknown>
}

function jerusalemDayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il').replace(
    /\/+$/,
    '',
  )
  const today = jerusalemDayKey()

  const { data: productData, error: productError } = await admin
    .from('products')
    .select('id, name_he, slug, status, stock_quantity, kenyon_price_agorot, full_price_agorot')
    .is('deleted_at', null)
    .limit(MAX_PRODUCTS)
  if (productError) {
    log.error('wishlist_alerts.products_read_failed', { reason: productError.message })
    return NextResponse.json({ ok: false, error: productError.message }, { status: 500 })
  }
  const products = (productData ?? []) as unknown as ProductRow[]
  const productById = new Map(products.map((p) => [p.id, p]))

  // ---- 1. today's snapshot, minus the observations that already exist -----
  let snapshotted = 0
  {
    const { data: existing } = await admin
      .from('price_history' as never)
      .select('product_id, price_agorot')
      .eq('observed_on', today)
    const seen = new Set(
      ((existing ?? []) as unknown as { product_id: string; price_agorot: number }[]).map(
        (row) => `${row.product_id}:${row.price_agorot}`,
      ),
    )
    const rows = products
      .filter(
        (p) => p.kenyon_price_agorot !== null && !seen.has(`${p.id}:${p.kenyon_price_agorot}`),
      )
      .map((p) => ({
        product_id: p.id,
        observed_on: today,
        price_agorot: p.kenyon_price_agorot,
        reference_agorot: p.full_price_agorot,
        status: p.status ?? 'unknown',
        source: 'snapshot',
      }))
    if (rows.length > 0) {
      const { error } = await admin.from('price_history' as never).insert(rows as never)
      // 23505 is a concurrent run winning the race to the same observation,
      // which is the unique index doing its job, not a failure.
      if (error && error.code !== '23505') {
        log.warn('wishlist_alerts.snapshot_failed', { reason: error.message })
      } else if (!error) {
        snapshotted = rows.length
      }
    }
  }

  // ---- who saved what ------------------------------------------------------
  const { data: wishlistData, error: wishlistError } = await admin
    .from('wishlists' as never)
    .select('user_id, product_id')
    .is('deleted_at', null)
  if (wishlistError && !TABLE_MISSING.has(wishlistError.code ?? '')) {
    log.error('wishlist_alerts.wishlists_read_failed', { reason: wishlistError.message })
  }
  const wishlistRows = (wishlistData ?? []) as unknown as { user_id: string; product_id: string }[]
  const ownersByProduct = new Map<string, string[]>()
  for (const row of wishlistRows) {
    const owners = ownersByProduct.get(row.product_id) ?? []
    owners.push(row.user_id)
    ownersByProduct.set(row.product_id, owners)
  }

  // ---- 2. price drops over the wishlisted products ------------------------
  const drops = new Map<string, { oldAgorot: number; newAgorot: number }>()
  const wishlistedIds = [...ownersByProduct.keys()].filter((id) => {
    const p = productById.get(id)
    return p != null && p.status === 'active'
  })
  if (wishlistedIds.length > 0) {
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Jerusalem',
    })
    const { data: historyData, error: historyError } = await admin
      .from('price_history' as never)
      .select('product_id, observed_on, price_agorot')
      .in('product_id', wishlistedIds)
      .gte('observed_on', since)
    if (historyError) {
      log.warn('wishlist_alerts.history_read_failed', { reason: historyError.message })
    }
    const byProduct = new Map<string, { observed_on: string; price_agorot: number }[]>()
    for (const row of (historyData ?? []) as unknown as {
      product_id: string
      observed_on: string
      price_agorot: number
    }[]) {
      const rows = byProduct.get(row.product_id) ?? []
      rows.push(row)
      byProduct.set(row.product_id, rows)
    }
    for (const id of wishlistedIds) {
      const previous = previousObservedPrice(byProduct.get(id) ?? [], today)
      const drop = detectPriceDrop(previous, productById.get(id)?.kenyon_price_agorot)
      if (drop) drops.set(id, drop)
    }
  }

  // ---- 3. restock flips against the last-seen flags -----------------------
  const restocked: string[] = []
  let stateAvailable = true
  {
    const { data: stateData, error: stateError } = await admin
      .from('wishlist_stock_state' as never)
      .select('product_id, in_stock')
    if (stateError) {
      stateAvailable = false
      if (!TABLE_MISSING.has(stateError.code ?? '')) {
        log.warn('wishlist_alerts.stock_state_read_failed', { reason: stateError.message })
      }
    } else {
      const lastSeen = new Map(
        ((stateData ?? []) as unknown as { product_id: string; in_stock: boolean }[]).map((row) => [
          row.product_id,
          row.in_stock,
        ]),
      )
      const changed: { product_id: string; in_stock: boolean }[] = []
      for (const p of products) {
        const nowInStock = isInStock(p.stock_quantity, p.status)
        const before = lastSeen.get(p.id)
        if (before === false && nowInStock) restocked.push(p.id)
        if (before !== nowInStock) changed.push({ product_id: p.id, in_stock: nowInStock })
      }
      if (changed.length > 0) {
        const { error } = await admin
          .from('wishlist_stock_state' as never)
          .upsert(changed as never, { onConflict: 'product_id' } as never)
        if (error) log.warn('wishlist_alerts.stock_state_write_failed', { reason: error.message })
      }
    }
  }

  // ---- recipients, their prefs, their addresses ---------------------------
  const affectedUserIds = new Set<string>()
  for (const id of drops.keys())
    for (const u of ownersByProduct.get(id) ?? []) affectedUserIds.add(u)
  for (const id of restocked) for (const u of ownersByProduct.get(id) ?? []) affectedUserIds.add(u)

  const prefsByUser = new Map<string, PrefsRow>()
  if (affectedUserIds.size > 0) {
    const { data, error } = await admin
      .from('wishlist_alert_prefs' as never)
      .select('user_id, price_drop, back_in_stock')
      .in('user_id', [...affectedUserIds])
    // A missing table means nobody has ever opted out, which is exactly what
    // an absent row means once 233 lands: the defaults apply either way.
    if (error && !TABLE_MISSING.has(error.code ?? '')) {
      log.warn('wishlist_alerts.prefs_read_failed', { reason: error.message })
    }
    for (const row of (data ?? []) as unknown as PrefsRow[]) prefsByUser.set(row.user_id, row)
  }

  const emailByUser = new Map<string, string>()
  if (affectedUserIds.size > 0) {
    const { data } = await admin
      .from('profiles')
      .select('id, email')
      .in('id', [...affectedUserIds])
    for (const row of (data ?? []) as unknown as { id: string; email: string | null }[]) {
      if (row.email) emailByUser.set(row.id, row.email.toLowerCase())
    }
  }

  // ---- compose the queue --------------------------------------------------
  const inserts: OutboxInsert[] = []

  for (const [productId, drop] of drops) {
    const product = productById.get(productId)
    if (!product) continue
    for (const userId of ownersByProduct.get(productId) ?? []) {
      if (prefsByUser.get(userId)?.price_drop === false) continue
      const email = emailByUser.get(userId)
      if (!email) continue
      const token = createUnsubscribeToken(userId, 'alerts')
      inserts.push({
        kind: 'price_drop',
        recipient_email: email,
        user_id: userId,
        dedupe_key: priceDropDedupeKey(userId, productId, drop.newAgorot),
        payload: {
          product_id: productId,
          product_name: product.name_he,
          slug: product.slug,
          old_agorot: drop.oldAgorot,
          new_agorot: drop.newAgorot,
          unsubscribe_url: token ? `${site}/wishlist-alerts/unsubscribe?token=${token}` : null,
        },
      })
    }
  }

  for (const productId of restocked) {
    const product = productById.get(productId)
    if (!product) continue
    for (const userId of ownersByProduct.get(productId) ?? []) {
      if (prefsByUser.get(userId)?.back_in_stock === false) continue
      const email = emailByUser.get(userId)
      if (!email) continue
      const token = createUnsubscribeToken(userId, 'alerts')
      inserts.push({
        kind: 'back_in_stock',
        recipient_email: email,
        user_id: userId,
        dedupe_key: backInStockDedupeKey(userId, productId, today),
        payload: {
          product_id: productId,
          product_name: product.name_he,
          slug: product.slug,
          price_agorot: product.kenyon_price_agorot,
          unsubscribe_url: token ? `${site}/wishlist-alerts/unsubscribe?token=${token}` : null,
        },
      })
    }
  }

  // ---- 4. the waitlist, which needs no prefs and no account ---------------
  const notifiedWaitlistIds: string[] = []
  {
    const { data, error } = await admin
      .from('stock_waitlist' as never)
      .select('id, product_id, email, user_id')
      .is('notified_at', null)
    if (error && !TABLE_MISSING.has(error.code ?? '')) {
      log.warn('wishlist_alerts.waitlist_read_failed', { reason: error.message })
    }
    for (const row of (data ?? []) as unknown as {
      id: string
      product_id: string
      email: string
      user_id: string | null
    }[]) {
      const product = productById.get(row.product_id)
      if (!product || !isInStock(product.stock_quantity, product.status)) continue
      notifiedWaitlistIds.push(row.id)
      inserts.push({
        kind: 'back_in_stock',
        recipient_email: row.email,
        user_id: row.user_id,
        dedupe_key: waitlistDedupeKey(row.id),
        payload: {
          product_id: row.product_id,
          product_name: product.name_he,
          slug: product.slug,
          price_agorot: product.kenyon_price_agorot,
          // A one-shot mail the person explicitly asked for carries no
          // unsubscribe: `notified_at` below IS the "never again".
          unsubscribe_url: null,
        },
      })
    }
  }

  // ---- suppressions outrank everything, same as the enqueue RPC -----------
  if (inserts.length > 0) {
    const addresses = [...new Set(inserts.map((row) => row.recipient_email))]
    const { data } = await admin
      .from('email_suppressions' as never)
      .select('email')
      .in('email', addresses)
    const suppressed = new Set(
      ((data ?? []) as unknown as { email: string }[]).map((row) => row.email.toLowerCase()),
    )
    if (suppressed.size > 0) {
      for (let i = inserts.length - 1; i >= 0; i--) {
        const row = inserts[i]
        if (row && suppressed.has(row.recipient_email)) inserts.splice(i, 1)
      }
    }
  }

  let queued = 0
  let deduped = 0
  let failed = 0
  for (const row of inserts.slice(0, MAX_ALERTS)) {
    const { error } = await admin.from('notification_outbox').insert(row as never)
    if (!error) queued++
    else if (error.code === '23505' || error.message.includes('duplicate')) deduped++
    else {
      failed++
      log.warn('wishlist_alerts.enqueue_failed', { dedupe: row.dedupe_key, reason: error.message })
    }
  }

  // Stamp the waitlist only after its mail is safely queued (or already was).
  if (notifiedWaitlistIds.length > 0 && failed === 0) {
    const { error } = await admin
      .from('stock_waitlist' as never)
      .update({ notified_at: new Date().toISOString() } as never)
      .in('id', notifiedWaitlistIds)
    if (error) log.warn('wishlist_alerts.waitlist_stamp_failed', { reason: error.message })
  }

  return NextResponse.json({
    ok: true,
    day: today,
    snapshotted,
    priceDrops: drops.size,
    restocked: restocked.length,
    stateAvailable,
    waitlisted: notifiedWaitlistIds.length,
    queued,
    deduped,
    failed,
  })
}

export const GET = withRequestLog('/api/cron/wishlist-alerts', handleGET)
