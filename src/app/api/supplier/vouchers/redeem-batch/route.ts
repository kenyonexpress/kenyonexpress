import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { identityScopedClient } from '@/lib/supabase/bearer'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { settledKeys } from '@/lib/vouchers/offline-scan'
import { normalizeVoucherCode } from '@/server/domain/vouchers/code'
import { verifyVoucherQrPayload } from '@/server/domain/vouchers/qr'
import { readScanContext } from '@/server/domain/vouchers/scan-context'
import { stampSettlementRedeemed } from '@/server/domain/vouchers/stamp-settlement'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Drains the till's offline queue.
 *
 * WHAT MAKES IT SAFE IS NOT THIS ROUTE. Every item carries an
 * `idempotency_key` the DEVICE generated at the moment of the scan, and
 * `redeem_voucher` (051) already keys its whole effect on it. So a queue that
 * is sent twice - because the reply was lost, because the app was killed
 * mid-drain, because the cashier tapped sync again - burns each voucher exactly
 * once and reports `replayed` for the repeats. The atomicity is per ITEM and it
 * lives in the database, where it always did.
 *
 * THERE IS DELIBERATELY NO ALL-OR-NOTHING TRANSACTION ACROSS THE BATCH. Twenty
 * scans made over an afternoon are twenty independent facts; rolling nineteen
 * good ones back because the twentieth voucher had expired would mean the
 * cashier has to work out which is which from a screen. Each item gets its own
 * outcome and the app shows them as a list.
 *
 * ORDER IS PRESERVED AND THE LOOP IS SEQUENTIAL. Two offline scans of the SAME
 * voucher must resolve to one success and one `already_redeemed`, in the order
 * they happened, not to a race whose winner depends on connection scheduling.
 */

const itemSchema = z.object({
  code: z.string().trim().max(64).optional(),
  qr_payload: z.string().trim().max(2048).optional(),
  scan_method: z.enum(['camera', 'manual']).default('camera'),
  // Not optional here, unlike the single-scan route: an offline item without a
  // key cannot be replayed safely and must be rejected rather than guessed at.
  idempotency_key: z.string().trim().min(8).max(128),
  staff_id: z.string().uuid().optional(),
  /** When the cashier actually scanned it. Recorded, never used to decide. */
  scanned_at: z.string().datetime().optional(),
})

const bodySchema = z.object({
  // A real till does not accumulate more than this in one outage, and an
  // unbounded array is a way to hold a serverless invocation open.
  items: z.array(itemSchema).min(1).max(50),
})

type ItemOutcome = {
  idempotency_key: string
  outcome: string
  replayed: boolean
  code: string | null
  message: string | null
}

const MESSAGES: Record<string, string> = {
  success: 'מומש',
  already_redeemed: 'כבר מומש',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
  refunded: 'הוחזר ללקוח',
  not_found: 'לא נמצא',
  invalid_signature: 'קוד לא תקין',
  error: 'שגיאה, יסונכרן שוב',
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const scanContext = readScanContext(request.headers)

  const scoped = await identityScopedClient(request)
  if (!scoped) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { client: supabase, identity } = scoped

  // How often a device may DRAIN. 40 an hour is a sync every 90 seconds
  // without pause.
  const allowed = await checkRateLimit(`voucher-redeem-batch:${identity.user.id}`, 40, 3600)
  if (!allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  // EVERY ITEM COUNTS AGAINST THE SAME CEILING A SINGLE SCAN DOES, and this is
  // a fix rather than a precaution.
  //
  // The batch limit above bounds how often a device syncs, not how many
  // vouchers it burns. Without this loop, 40 drains of 50 items is 2,000
  // redemption attempts an hour from one member - against a single-scan
  // endpoint that allows 120. The batch route would have been the way around
  // its own sibling's ceiling.
  //
  // The shared key is the same `voucher-redeem:<user>` bucket the single-scan
  // route uses, so a till cannot spend its allowance twice by alternating
  // between the two endpoints.
  for (let index = 0; index < parsed.data.items.length; index++) {
    const withinCeiling = await checkRateLimit(`voucher-redeem:${identity.user.id}`, 120, 3600)
    if (!withinCeiling) {
      // Refused BEFORE the loop touches the database, so a batch is either
      // attempted or not - never half-burned with the rest rejected, which
      // would leave the queue holding items whose vouchers were already gone.
      return NextResponse.json({ ok: false, error: 'rate_limited', settled: [] }, { status: 429 })
    }
  }

  const results: ItemOutcome[] = []

  for (const item of parsed.data.items) {
    let shortCode: string | null = null

    if (item.qr_payload) {
      const verified = verifyVoucherQrPayload(item.qr_payload)
      if (!verified) {
        // Refused before the database is touched, and NOT retried: a signature
        // does not become valid later, so leaving it in the queue would make
        // the cashier watch one bad scan fail forever.
        results.push({
          idempotency_key: item.idempotency_key,
          outcome: 'invalid_signature',
          replayed: false,
          code: null,
          message: MESSAGES.invalid_signature ?? null,
        })
        continue
      }
      shortCode = normalizeVoucherCode(verified.c)
    } else if (item.code) {
      shortCode = normalizeVoucherCode(item.code)
    }

    if (!shortCode) {
      results.push({
        idempotency_key: item.idempotency_key,
        outcome: 'not_found',
        replayed: false,
        code: null,
        message: MESSAGES.not_found ?? null,
      })
      continue
    }

    const { data, error } = await supabase.rpc('redeem_voucher', {
      p_code: shortCode,
      p_scan_method: item.scan_method,
      p_idempotency_key: item.idempotency_key,
      p_ip: scanContext.ip,
      p_user_agent: scanContext.userAgent,
    })

    if (error) {
      log.error('voucher.redeem_batch_rpc_failed', { reason: error.message })
      // 'error' is the one outcome the app keeps in its queue. Everything else
      // above is a decision the server has made and will make identically next
      // time, so re-sending it would only produce the same answer.
      results.push({
        idempotency_key: item.idempotency_key,
        outcome: 'error',
        replayed: false,
        code: shortCode,
        message: MESSAGES.error ?? null,
      })
      continue
    }

    const result = (data ?? {}) as Record<string, unknown>
    const outcome = typeof result.outcome === 'string' ? result.outcome : 'not_found'

    // Same lifecycle stamp the single-scan route applies, because a queue
    // drained from the till redeems exactly as a live scan does and the UX
    // spec's acceptance does not care which door the scan came through. Runs on
    // replays too; the update is a no-op once the line is already `redeemed`.
    if (outcome === 'success' && typeof result.voucher_id === 'string') {
      await stampSettlementRedeemed(result.voucher_id)
    }

    results.push({
      idempotency_key: item.idempotency_key,
      outcome,
      replayed: result.replayed === true,
      code: (result.code as string) ?? shortCode,
      message: MESSAGES[outcome] ?? null,
    })
  }

  return NextResponse.json({
    ok: true,
    results,
    // What the app clears from its queue. Everything not listed here stays.
    // The rule lives in lib/vouchers/offline-scan.ts because getting it wrong
    // in either direction is a real failure: forget a retryable item and a
    // voucher is never redeemed, retry a settled one and the till re-sends the
    // same refusal forever.
    settled: settledKeys(results),
  })
}

export const POST = withRequestLog('/api/supplier/vouchers/redeem-batch', handlePOST)
