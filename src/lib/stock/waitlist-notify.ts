import { log } from '@/lib/observability/log'
import { isInStock, waitlistDedupeKey } from '@/lib/wishlist/alerts'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The restock batch for ONE product: everyone who pressed "tell me when it is
 * back" (`stock_waitlist`, 195) gets one `back_in_stock` row in
 * `notification_outbox`, and their request is stamped `notified_at`.
 *
 * TWO CALLERS, ONE SHAPE. The daily `/api/cron/wishlist-alerts` drains the
 * whole table at 04:45 and is the backstop for every write path this module
 * does not see (a refund's `restock_order_stock`, a CSV import, a SQL fix).
 * The admin product editor and the bulk status tool call this the moment an
 * operator moves a product from sold out to on sale, so the people who asked
 * hear about it within the drain's five minutes instead of tomorrow morning.
 * Both paths build the outbox row through `waitlistOutboxRow`, so the mail
 * and the push read the same payload whichever path queued them.
 *
 * WHY IT CANNOT DOUBLE-MAIL. The outbox has a UNIQUE on `dedupe_key`, and the
 * key is the waitlist row id (`lib/wishlist/alerts.ts`): one person, one
 * product, one request, one mail. If the editor queues at 10:00 and the cron
 * finds the same row still unstamped at 04:45, the second insert is a 23505
 * and is counted as deduped, not sent. Stamping happens only for rows whose
 * outbox insert succeeded or was already there.
 *
 * VARIANTS. A request made for a specific variant is honoured only when THAT
 * variant is back; a request with no variant is honoured when the product is.
 * A request for a variant that has since been deleted is dropped from the
 * batch and left unstamped, so a later re-activation can still serve it.
 *
 * Money: `price_agorot` is the integer column, copied, never computed.
 */

/** Missing table, PostgREST's code for it and Postgres's own. */
export const TABLE_MISSING = new Set(['PGRST205', '42P01'])

/** Ceiling per product per call. A longer list carries to the daily cron. */
export const WAITLIST_BATCH_MAX = 500

export interface WaitlistRow {
  id: string
  product_id: string
  variant_id: string | null
  email: string
  user_id: string | null
}

export interface WaitlistProduct {
  id: string
  name_he: string | null
  slug: string | null
  status: string | null
  stock_quantity: number | null
  kenyon_price_agorot: number | null
}

export interface WaitlistOutboxRow {
  kind: 'back_in_stock'
  recipient_email: string
  user_id: string | null
  dedupe_key: string
  payload: {
    product_id: string
    product_name: string | null
    slug: string | null
    price_agorot: number | null
    /** A one-shot mail the person asked for: `notified_at` IS the opt-out. */
    unsubscribe_url: null
  }
}

export function waitlistOutboxRow(row: WaitlistRow, product: WaitlistProduct): WaitlistOutboxRow {
  return {
    kind: 'back_in_stock',
    recipient_email: row.email.toLowerCase(),
    user_id: row.user_id,
    dedupe_key: waitlistDedupeKey(row.id),
    payload: {
      product_id: row.product_id,
      product_name: product.name_he,
      slug: product.slug,
      price_agorot: product.kenyon_price_agorot,
      unsubscribe_url: null,
    },
  }
}

export interface StockLevel {
  stock_quantity: number | null
  status: string | null
}

/**
 * The transition the hooks fire on: not sellable before, sellable now. A
 * product that was never sold out (or stays sold out) is not a restock, and
 * neither is a draft gaining stock, since a draft is not on sale.
 */
export function crossedIntoStock(before: StockLevel | null, after: StockLevel): boolean {
  if (!before) return false
  return (
    !isInStock(before.stock_quantity, before.status) &&
    isInStock(after.stock_quantity, after.status)
  )
}

export interface WaitlistNotifyResult {
  ok: boolean
  /** Why nothing was queued, when nothing was. */
  reason?: string
  waiting: number
  queued: number
  deduped: number
  failed: number
  stamped: number
}

const NOTHING: Omit<WaitlistNotifyResult, 'ok' | 'reason'> = {
  waiting: 0,
  queued: 0,
  deduped: 0,
  failed: 0,
  stamped: 0,
}

type VariantRow = {
  id: string
  stock_quantity: number | null
  is_active: boolean | null
  deleted_at: string | null
}

export async function notifyProductWaitlist(
  admin: SupabaseClient,
  productId: string,
  now: Date = new Date(),
): Promise<WaitlistNotifyResult> {
  const { data: productData, error: productError } = await admin
    .from('products')
    .select('id, name_he, slug, status, stock_quantity, kenyon_price_agorot')
    .eq('id', productId)
    .is('deleted_at', null)
    .maybeSingle()
  if (productError) {
    log.warn('stock_waitlist.product_read_failed', { productId, reason: productError.message })
    return { ok: false, reason: productError.message, ...NOTHING }
  }
  const product = (productData ?? null) as WaitlistProduct | null
  if (!product) return { ok: true, reason: 'no such product', ...NOTHING }
  if (!isInStock(product.stock_quantity, product.status)) {
    return { ok: true, reason: 'not in stock', ...NOTHING }
  }

  const { data: waitData, error: waitError } = await admin
    .from('stock_waitlist' as never)
    .select('id, product_id, variant_id, email, user_id')
    .eq('product_id', productId)
    .is('notified_at', null)
    .limit(WAITLIST_BATCH_MAX)
  if (waitError) {
    if (!TABLE_MISSING.has(waitError.code ?? '')) {
      log.warn('stock_waitlist.read_failed', { productId, reason: waitError.message })
    }
    return { ok: false, reason: waitError.message, ...NOTHING }
  }
  let rows = ((waitData ?? []) as unknown as WaitlistRow[]).filter(
    (row) => typeof row.email === 'string' && row.email.includes('@'),
  )
  if (rows.length === 0) return { ok: true, reason: 'nobody waiting', ...NOTHING }

  // Variant-specific requests are honoured only when that variant is back.
  const variantIds = [...new Set(rows.map((r) => r.variant_id).filter((v): v is string => !!v))]
  if (variantIds.length > 0) {
    const { data: variantData, error: variantError } = await admin
      .from('product_variants')
      .select('id, stock_quantity, is_active, deleted_at')
      .in('id', variantIds)
    if (variantError) {
      log.warn('stock_waitlist.variants_read_failed', { productId, reason: variantError.message })
    }
    const sellable = new Set(
      ((variantData ?? []) as unknown as VariantRow[])
        .filter(
          (v) =>
            v.deleted_at === null &&
            v.is_active !== false &&
            (v.stock_quantity === null || v.stock_quantity > 0),
        )
        .map((v) => v.id),
    )
    rows = rows.filter((row) => row.variant_id === null || sellable.has(row.variant_id))
  }
  const waiting = rows.length
  if (waiting === 0) return { ok: true, reason: 'no sellable variant waited on', ...NOTHING }

  // Suppressions outrank everything, same as the enqueue RPC and the cron.
  const addresses = [...new Set(rows.map((r) => r.email.toLowerCase()))]
  const { data: suppressedData, error: suppressedError } = await admin
    .from('email_suppressions' as never)
    .select('email')
    .in('email', addresses)
  if (suppressedError) {
    // Fail closed: a list we cannot read is a list we must not mail past.
    log.warn('stock_waitlist.suppressions_read_failed', {
      productId,
      reason: suppressedError.message,
    })
    return { ok: false, reason: suppressedError.message, ...NOTHING, waiting }
  }
  const suppressed = new Set(
    ((suppressedData ?? []) as unknown as { email: string }[]).map((r) => r.email.toLowerCase()),
  )

  let queued = 0
  let deduped = 0
  let failed = 0
  const settled: string[] = []
  for (const row of rows) {
    if (suppressed.has(row.email.toLowerCase())) {
      // Nothing to send, and nothing to send later either: stamp it so the
      // daily cron does not re-read it forever.
      settled.push(row.id)
      continue
    }
    const { error } = await admin
      .from('notification_outbox')
      .insert(waitlistOutboxRow(row, product) as never)
    if (!error) {
      queued++
      settled.push(row.id)
    } else if (error.code === '23505' || error.message.includes('duplicate')) {
      deduped++
      settled.push(row.id)
    } else {
      failed++
      log.warn('stock_waitlist.enqueue_failed', { waitlistId: row.id, reason: error.message })
    }
  }

  let stamped = 0
  if (settled.length > 0) {
    const { error } = await admin
      .from('stock_waitlist' as never)
      .update({ notified_at: now.toISOString() } as never)
      .in('id', settled)
    if (error) log.warn('stock_waitlist.stamp_failed', { productId, reason: error.message })
    else stamped = settled.length
  }

  log.info('stock_waitlist.restock_batch', { productId, waiting, queued, deduped, failed, stamped })
  return { ok: failed === 0, waiting, queued, deduped, failed, stamped }
}
