import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Nightly logical backup: the business tables, as JSON, into a private
 * Storage bucket. One object per UTC day, `daily/YYYY-MM-DD.json`.
 *
 * WHAT THIS IS AND IS NOT. Supabase keeps its own physical backups of the
 * whole database; this job does not replace them and does not try. What it
 * adds is a copy that WE hold, on a schedule WE see fail (the scheduler's run
 * history), covering the rows that cannot be reconstructed from anywhere
 * else: orders, the money legs around them, vouchers and wallets. Catalogue
 * tables ride along because they are small and a restore without them is a
 * shop with orders and nothing to sell.
 *
 * WHAT IS DELIBERATELY LEFT OUT. `payment_tokens` (card tokens have one home,
 * fewer copies is the point), the analytics/event/outbox tables (bulky, and
 * either reconstructible from the provider or worthless after the fact), and
 * `rate_limits`-style operational scratch. Adding a table is a one-line diff
 * to TABLES.
 *
 * ALL OR NOTHING. A backup missing one table is worse than a failed run,
 * because it looks complete: nothing is uploaded unless every table read
 * succeeded, and a failed run answers 500 so the scheduler's history shows it
 * red and the next run takes the same day again.
 *
 * IDEMPOTENT PER DAY. The object key is the UTC date; if today's object
 * already exists the run answers `skipped` and reads nothing. Two schedulers
 * racing settle on `upsert: false` — the loser reports skipped, not a
 * clobbered file.
 *
 * BOUNDED, LOUDLY. Each table is capped at ROW_CAP rows but the true count is
 * always recorded, so a capped table shows up as `truncated` in the object,
 * the response and the log rather than as silently missing rows. At current
 * volumes nothing is anywhere near the cap.
 *
 * NO PRUNING. This job only ever adds objects; deleting old backups is a
 * human decision (and file deletion is one of the four stop-and-ask actions).
 * A year costs ~365 small JSON objects.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET.
 */

const BUCKET = 'db-backups'
const ROW_CAP = 10_000

const TABLES = [
  'orders',
  'order_items',
  'payments',
  'refunds',
  'invoices',
  'vouchers',
  'voucher_redemptions',
  'coupons',
  'coupon_codes',
  'wallet_accounts',
  'wallet_entries',
  'cashback_ledger',
  'escrow_holds',
  'products',
  'product_variants',
  'categories',
  'suppliers',
  'profiles',
  'user_addresses',
  'subscriptions',
] as const

function alreadyExists(message: string): boolean {
  return message.toLowerCase().includes('already exists')
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const day = new Date().toISOString().slice(0, 10)
  const objectPath = `daily/${day}.json`

  // The bucket is created here, private, on first run — not by a migration:
  // Storage buckets are not schema, and the only principal that ever touches
  // this one is the service role, which needs no policy rows.
  const { error: bucketError } = await admin.storage.createBucket(BUCKET, { public: false })
  if (bucketError && !alreadyExists(bucketError.message)) {
    log.error('backup.bucket_failed', { reason: bucketError.message })
    return NextResponse.json({ ok: false, error: bucketError.message }, { status: 500 })
  }

  const { data: existing, error: listError } = await admin.storage
    .from(BUCKET)
    .list('daily', { limit: 1, search: `${day}.json` })
  if (listError) {
    log.error('backup.list_failed', { reason: listError.message })
    return NextResponse.json({ ok: false, error: listError.message }, { status: 500 })
  }
  if ((existing ?? []).length > 0) {
    return NextResponse.json({ ok: true, skipped: true, day, path: objectPath })
  }

  const tables: Record<string, { rows: unknown[]; count: number; truncated: boolean }> = {}
  for (const table of TABLES) {
    const { data, error, count } = await admin
      .from(table)
      .select('*', { count: 'exact' })
      .limit(ROW_CAP)
    if (error) {
      log.error('backup.table_read_failed', { table, reason: error.message })
      return NextResponse.json({ ok: false, table, error: error.message }, { status: 500 })
    }
    const rows = (data ?? []) as unknown[]
    const total = count ?? rows.length
    tables[table] = { rows, count: total, truncated: total > rows.length }
  }

  const truncated = Object.entries(tables)
    .filter(([, t]) => t.truncated)
    .map(([name]) => name)
  if (truncated.length > 0) {
    log.warn('backup.tables_truncated', { truncated, cap: ROW_CAP })
  }

  const body = JSON.stringify({
    takenAt: new Date().toISOString(),
    day,
    rowCap: ROW_CAP,
    tables,
  })

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(objectPath, body, {
    contentType: 'application/json',
    upsert: false,
  })
  if (uploadError) {
    // The only benign way to lose this race is another scheduler having won
    // it between our list and our upload; their object is this object.
    if (alreadyExists(uploadError.message)) {
      return NextResponse.json({ ok: true, skipped: true, day, path: objectPath })
    }
    log.error('backup.upload_failed', { reason: uploadError.message })
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 })
  }

  const counts = Object.fromEntries(Object.entries(tables).map(([name, t]) => [name, t.count]))
  log.info('backup.written', { day, path: objectPath, bytes: body.length, counts })
  return NextResponse.json({ ok: true, day, path: objectPath, counts, truncated })
}

export const GET = withRequestLog('/api/cron/backup', handleGET)
