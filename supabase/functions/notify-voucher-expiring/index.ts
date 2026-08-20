import type { SupabaseClient } from '@supabase/supabase-js'
import { renderVoucherExpiring } from '../_shared/emails/render.ts'
import { drain, readNumber, readString } from '../_shared/outbox.ts'
import type { OutboxRow, Prepared } from '../_shared/outbox.ts'
import { adminClient, authorize, batchSize, json, siteUrl } from '../_shared/runtime.ts'

/**
 * Supabase Edge Function: notify-voucher-expiring
 *
 * The daily reminder that a coupon is about to lapse.
 *
 * Auth:     Authorization: Bearer $CRON_SECRET
 * Schedule: once a day (`supabase/schedules/notify-voucher-expiring.json`),
 *           09:00 Asia/Jerusalem.
 * Deploy:   supabase functions deploy notify-voucher-expiring --no-verify-jwt
 * Secrets:  CRON_SECRET, RESEND_API_KEY, SUPABASE_URL,
 *           SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL, EMAIL_FROM
 *
 * IT ENQUEUES AND THEN DRAINS, IN ONE INVOCATION. The other two functions only
 * drain, because a trigger fills their queue at the moment of the event. Nothing
 * triggers on the passage of time, so this one starts by asking the database
 * which vouchers crossed the bucket today. `114`'s
 * `enqueue_expiring_voucher_notices` is that question for email and `088`'s
 * `enqueue_expiring_voucher_inapp` is the same question for the bell; they run
 * back to back so the two cannot disagree about which coupons are close.
 *
 * WHY THE BUCKET IS THREE DAYS AND IT IS A LIST. Three is what was asked for and
 * it is the default here, and `p_buckets` stays an array because a reminder at
 * three days and again at one is the shape this eventually wants; `114` already
 * defaults to `[7, 1]` for exactly that reason. The dedupe key carries the
 * bucket, so adding a second one never re-sends the first.
 *
 * WHY ENQUEUEING TWICE IN A DAY IS HARMLESS. `fn_enqueue_notification` inserts
 * `ON CONFLICT (dedupe_key) DO NOTHING` and the key is
 * `voucher_expiring:<voucher>:<bucket>`. A retry, a manual invocation and the
 * scheduled run all collapse onto the same row.
 *
 * WHY A FAILED ENQUEUE DOES NOT ABORT THE DRAIN. Yesterday's rows may still be
 * sitting in the queue after a provider outage. Refusing to send them because
 * today's sweep hit an error would turn one bad day into two.
 */

/** Days-remaining buckets. Override per invocation with `{"buckets":[7,1]}`. */
const DEFAULT_BUCKETS = [3]

interface VoucherDetail {
  remainingDueAgorot: number | null
  supplierAddress: string | null
  supplierPhone: string | null
  expiresAt: string | null
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * The three fields the reminder needs and `114`'s payload does not carry.
 *
 * Every one of them is optional in the template, so a read that fails still
 * produces a mail that says which coupon, and when it lapses, and where to see
 * it. That is the part that makes somebody act.
 */
async function loadDetail(admin: SupabaseClient, voucherId: string): Promise<VoucherDetail> {
  const empty: VoucherDetail = {
    remainingDueAgorot: null,
    supplierAddress: null,
    supplierPhone: null,
    expiresAt: null,
  }

  const { data } = await admin
    .from('vouchers')
    .select('remaining_amount_due_agorot, expires_at, suppliers(address, contact_phone)')
    .eq('id', voucherId)
    .maybeSingle()

  if (!data) return empty

  const row = data as {
    remaining_amount_due_agorot: number | null
    expires_at: string | null
    suppliers:
      | { address: string | null; contact_phone: string | null }
      | { address: string | null; contact_phone: string | null }[]
      | null
  }
  const supplier = firstOf(row.suppliers)

  return {
    remainingDueAgorot: row.remaining_amount_due_agorot,
    supplierAddress: supplier?.address ?? null,
    supplierPhone: supplier?.contact_phone ?? null,
    expiresAt: row.expires_at,
  }
}

export function makePreparer(admin: SupabaseClient, site: string) {
  return async function prepare(row: OutboxRow): Promise<Prepared | null> {
    const voucherId = readString(row.payload, 'voucher_id')
    const code = readString(row.payload, 'code')
    if (!voucherId || !code) return null

    const detail = await loadDetail(admin, voucherId)

    // The live deadline wins over the queued one. A voucher whose expiry was
    // extended between the sweep and the send must not be announced with the
    // old date, and the payload's copy is the fallback rather than the source.
    const expiresAt = detail.expiresAt ?? readString(row.payload, 'expires_at')
    if (!expiresAt) return null

    const email = await renderVoucherExpiring({
      siteUrl: site,
      customerName: readString(row.payload, 'customer_name'),
      voucherId,
      code,
      productName: readString(row.payload, 'product_name'),
      supplierName: readString(row.payload, 'supplier_name'),
      supplierAddress: detail.supplierAddress,
      supplierPhone: detail.supplierPhone,
      expiresAt,
      daysRemaining: readNumber(row.payload, 'days_remaining') ?? 0,
      remainingDueAgorot: detail.remainingDueAgorot,
    })

    return { email }
  }
}

function readBuckets(body: unknown): number[] {
  if (typeof body !== 'object' || body === null) return DEFAULT_BUCKETS
  const raw = (body as { buckets?: unknown }).buckets
  if (!Array.isArray(raw)) return DEFAULT_BUCKETS
  const buckets = raw.filter(
    (value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0,
  )
  return buckets.length > 0 ? buckets : DEFAULT_BUCKETS
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST' && request.method !== 'GET') {
    return json({ ok: false, error: 'method' }, 405)
  }

  const refusal = authorize(request)
  if (refusal) return refusal

  try {
    const admin = adminClient()
    const site = siteUrl()

    const body = request.method === 'POST' ? await request.json().catch(() => null) : null
    const buckets = readBuckets(body)

    let queuedEmail = 0
    let queuedInApp = 0

    const { data: emailQueued, error: emailError } = await admin.rpc(
      'enqueue_expiring_voucher_notices',
      { p_buckets: buckets },
    )
    if (emailError) {
      console.error('notify-voucher-expiring: email enqueue failed', emailError.message)
    } else {
      queuedEmail = typeof emailQueued === 'number' ? emailQueued : 0
    }

    const { data: inAppQueued, error: inAppError } = await admin.rpc(
      'enqueue_expiring_voucher_inapp',
      { p_buckets: buckets },
    )
    if (inAppError) {
      // Expected until `088` is applied. The bell is a nice-to-have on this
      // path; the email is the reminder, and it has already been queued.
      console.error('notify-voucher-expiring: in-app enqueue failed', inAppError.message)
    } else {
      queuedInApp = typeof inAppQueued === 'number' ? inAppQueued : 0
    }

    const result = await drain(admin, {
      kinds: ['voucher_expiring'],
      limit: batchSize(50),
      source: 'edge:notify-voucher-expiring',
      prepare: makePreparer(admin, site),
    })

    return json({ ok: true, buckets, queuedEmail, queuedInApp, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('notify-voucher-expiring failed:', message)
    return json({ ok: false, error: message }, 500)
  }
})
