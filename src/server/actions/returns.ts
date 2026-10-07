'use server'

import { contactEmail } from '@/lib/contact-address'
import { sendEmail } from '@/lib/email/resend'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import {
  buildReturnReceivedCustomerNotice,
  buildReturnReceivedOwnerNotice,
} from '@/lib/returns/notices'
import {
  RETURN_REASONS,
  type ReturnDestination,
  type ReturnReasonCode,
  evaluateReturnEligibility,
  previewReturnRefund,
  refundDueBy,
  returnRequestFromForm,
  returnRequestSchema,
  rmaNumber,
} from '@/lib/returns/policy'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { getOrderDetail } from '@/server/queries/orders'
import { getOpenReturnForOrder } from '@/server/queries/returns'
import type { Json } from '@/types/database'
import { revalidatePath } from 'next/cache'

/**
 * The customer's cancellation notice (STEP 44): `refunds` in `requested`.
 *
 * Section 1.4 of the refunds architecture is the whole design: an online sale
 * must be cancellable online, and pressing the button must RECORD THE NOTICE
 * before anyone reviews it. The row is written here, now, with
 * `requested_at = now` and the trigger-derived 14-day deadline. Review decides
 * the outcome later (`decideReturnRequest`); it does not decide when the
 * notice arrived.
 *
 * Ownership is proven twice: `getOrderDetail` reads the order on the signed-in
 * user's id (a foreign id is null), and the insert runs on the service role
 * only after that. The service role is needed because 131 grants the
 * customer SELECT and nothing else, which is right: the eligibility rules
 * (paid, inside the window, nothing open) are the action's, and a client
 * that could insert would be a client that could skip them.
 *
 * NO MONEY MOVES HERE. `requested_agorot` is what was paid on site, the fee
 * is 0 until an admin decides, and `granted_agorot` is null. The lock is the
 * same partial UNIQUE the admin path races on: a second request while one is
 * open loses with 23505 and is told so.
 */

export type ReturnRequestResult =
  | { ok: true; rma: string; refundId: string }
  | {
      ok: false
      reason:
        | 'signed_out'
        | 'invalid'
        | 'rate_limited'
        | 'not_found'
        | 'not_eligible'
        | 'already_open'
        | 'destination_not_allowed'
        | 'error'
      error: string
    }

const SIGNED_OUT = 'צריך להתחבר כדי לבקש החזרה.'
const NOT_FOUND = 'ההזמנה לא נמצאה.'
const ALREADY_OPEN = 'כבר פתוחה בקשת החזרה להזמנה הזו.'
const DESTINATION_NOT_ALLOWED =
  'קופון שכבר מומש או פג אינו ניתן להחזר לכרטיס. אפשר לבקש זיכוי לארנק.'
const FAILED = 'שליחת הבקשה נכשלה. נסו שוב.'
const RATE_LIMITED = 'יותר מדי בקשות בשעה האחרונה. נסו שוב מאוחר יותר.'

/** PostgREST: column not in the schema cache (259 not applied). */
const COLUMN_MISSING_PGRST = 'PGRST204'
/** Postgres: undefined_column. */
const COLUMN_MISSING_PG = '42703'
const UNIQUE_VIOLATION = '23505'

type InsertResult = { data: { id: string; requested_at: string } | null; error: PgError | null }
type PgError = { message: string; code?: string }

async function insertRequest(
  admin: ReturnType<typeof createAdminClient>,
  row: Record<string, unknown>,
): Promise<InsertResult> {
  const attempt = async (payload: Record<string, unknown>): Promise<InsertResult> => {
    const { data, error } = await admin
      .from('refunds')
      .insert(payload as never)
      .select('id, requested_at')
      .maybeSingle()
    return { data: (data as InsertResult['data']) ?? null, error }
  }
  const first = await attempt(row)
  const code = first.error?.code
  if (
    first.error &&
    (code === COLUMN_MISSING_PGRST || code === COLUMN_MISSING_PG) &&
    'reason_code' in row
  ) {
    // 259 not applied: keep the code as the first line of reason_he (it
    // already is, see below) and drop the column.
    const { reason_code: _dropped, ...without } = row
    void _dropped
    return attempt(without)
  }
  return first
}

async function runSubmitReturnRequest(formData: FormData): Promise<ReturnRequestResult> {
  const parsed = returnRequestSchema.safeParse(returnRequestFromForm(formData))
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      error: parsed.error.issues[0]?.message ?? 'בדקו את הפרטים ונסו שוב.',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'signed_out', error: SIGNED_OUT }
  const userId = user.id

  if (!(await checkRateLimit(`return-request:${userId}`, 5, 3600))) {
    return { ok: false, reason: 'rate_limited', error: RATE_LIMITED }
  }

  const { orderId, reasonCode, destination } = parsed.data
  const note = parsed.data.note && parsed.data.note.length > 0 ? parsed.data.note : null

  // Scoped to the signed-in user inside; a foreign order is null here.
  const order = await getOrderDetail(orderId)
  if (!order) return { ok: false, reason: 'not_found', error: NOT_FOUND }

  const open = await getOpenReturnForOrder(order.id)
  const now = new Date()
  const eligibility = evaluateReturnEligibility({
    status: order.status,
    paidAt: order.paidAt,
    lines: order.lines.map((line) => ({
      productType: line.productType,
      settlementStatus: line.settlementStatus,
      deliveredAt: line.deliveredAt,
      voucherStatuses: line.vouchers.map((v) => v.status),
    })),
    openRequest: open !== null,
    now,
  })
  if (!eligibility.ok) {
    return {
      ok: false,
      reason: eligibility.reason === 'already_open' ? 'already_open' : 'not_eligible',
      error: eligibility.message,
    }
  }
  if (!eligibility.allowedDestinations.includes(destination)) {
    return { ok: false, reason: 'destination_not_allowed', error: DESTINATION_NOT_ALLOWED }
  }

  const admin = createAdminClient()
  // The original charge, for `payment_id`. Nullable in 131; a wallet-only
  // order (card charge 0) legitimately has none.
  const { data: charge } = await admin
    .from('payments')
    .select('id')
    .eq('order_id', order.id)
    .eq('kind', 'charge')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const reasonHe = note
    ? `${RETURN_REASONS[reasonCode].label}\n${note}`
    : RETURN_REASONS[reasonCode].label
  const inserted = await insertRequest(admin, {
    order_id: order.id,
    payment_id: charge?.id ?? null,
    state: 'requested',
    ground: RETURN_REASONS[reasonCode].ground,
    destination,
    requested_agorot: order.totalAgorot,
    cancellation_fee_agorot: 0,
    granted_agorot: null,
    cancel_only: false,
    reason_he: reasonHe,
    reason_code: reasonCode,
    requested_by: userId,
    requested_at: now.toISOString(),
  })
  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === UNIQUE_VIOLATION) {
      return { ok: false, reason: 'already_open', error: ALREADY_OPEN }
    }
    log.error('returns.request_not_written', {
      orderId: order.id,
      code: inserted.error?.code ?? null,
      reason: inserted.error?.message ?? 'no row returned',
    })
    return { ok: false, reason: 'error', error: FAILED }
  }

  const refundId = inserted.data.id
  const requestedAt = inserted.data.requested_at ?? now.toISOString()
  const rma = rmaNumber(refundId, requestedAt)

  // Everything below is best effort: the notice is recorded, which is the
  // legal event, and a mail or audit row that fails must not tell the
  // customer their request was not received.
  await admin
    .from('audit_log')
    .insert({
      actor_id: userId,
      actor_role: 'customer',
      action: 'status_change',
      entity_type: 'refund',
      entity_id: refundId,
      changes: { state: { from: null, to: 'requested' } } as unknown as Json,
      metadata: {
        source: 'return_request',
        order_id: order.id,
        rma,
        reason_code: reasonCode,
        destination,
        requested_agorot: order.totalAgorot,
      } as unknown as Json,
    })
    .then(({ error }) => {
      if (error) log.warn('returns.audit_not_written', { refundId, err: error.message })
    })

  await notifyReceived({
    rma,
    orderRef: order.id.slice(0, 8).toUpperCase(),
    reasonCode,
    destination,
    note,
    requestedAgorot: order.totalAgorot,
    hasPhysical: eligibility.hasPhysical,
    refundDueBy: refundDueBy(requestedAt).toISOString(),
    customerName:
      typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null,
    customerEmail: user.email ?? null,
  })

  revalidatePath('/account/return')
  revalidatePath(`/account/orders/${order.id}`)
  return { ok: true, rma, refundId }
}

async function notifyReceived(input: {
  rma: string
  orderRef: string
  reasonCode: ReturnReasonCode
  destination: ReturnDestination
  note: string | null
  requestedAgorot: number
  hasPhysical: boolean
  refundDueBy: string
  customerName: string | null
  customerEmail: string | null
}): Promise<void> {
  const preview = previewReturnRefund({
    requestedAgorot: input.requestedAgorot,
    reasonCode: input.reasonCode,
    destination: input.destination,
  })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  const base = {
    ...input,
    feeAgorot: preview.feeAgorot,
    refundAgorot: preview.refundAgorot,
    appUrl,
  }
  const sends: Promise<unknown>[] = []
  if (input.customerEmail) {
    const customer = buildReturnReceivedCustomerNotice(base)
    sends.push(
      sendEmail({ to: input.customerEmail, ...customer }).then((sent) => {
        if (!sent.ok && !sent.skipped) {
          log.warn('returns.customer_mail_failed', { rma: input.rma, reason: sent.reason })
        }
      }),
    )
  }
  const owner = buildReturnReceivedOwnerNotice(base)
  sends.push(
    sendEmail({
      to: contactEmail(),
      replyTo: input.customerEmail ?? undefined,
      ...owner,
    }).then((sent) => {
      if (!sent.ok && !sent.skipped) {
        log.warn('returns.owner_mail_failed', { rma: input.rma, reason: sent.reason })
      }
    }),
  )
  await Promise.all(sends)
}

export async function submitReturnRequest(formData: FormData): Promise<ReturnRequestResult> {
  return withActionContext('returns.submit', () => runSubmitReturnRequest(formData))
}
