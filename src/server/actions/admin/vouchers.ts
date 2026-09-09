'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { isScannable } from '@/lib/admin/voucher-view'
import { withActionContext } from '@/lib/observability/action-context'
import { siteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { callPendingExpiryRpc, pendingExpiryRpc } from '@/lib/supabase/pending-expiry'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { endOfJerusalemDay } from '@/lib/vouchers/expiry-date'
import { normalizeVoucherCode } from '@/server/domain/vouchers/code'
import { sendVoucherEmail } from '@/server/payments/voucher-email'

export type AdminVoucherLookup = {
  id: string
  code: string
  status: string
  productName: string | null
  customerName: string | null
  supplierName: string | null
  supplierId: string | null
  faceValueAgorot: number
  couponPriceAgorot: number
  remainingAmountDueAgorot: number
  expiresAt: string
  /**
   * The ceiling an extension cannot pass. `vouchers_expires_within_offer`
   * enforces `expires_at <= offer_valid_until`, so the form needs this to set
   * the input's `max` rather than let an operator pick a date the database will
   * reject after they have typed a reason.
   */
  offerValidUntil: string | null
  redeemedAt: string | null
  scannable: boolean
}

export type AdminVoucherLookupState = { error: string } | { voucher: AdminVoucherLookup } | null

export type AdminVoucherRedeemState = { error: string } | { success: string; code: string } | null

export type AdminVoucherResendState = { error: string } | { success: string; code: string } | null

export type AdminVoucherExtendState = { error: string } | { success: string; code: string } | null

type VoucherLookupRow = {
  id: string
  code: string
  status: string
  face_value_agorot: number
  coupon_price_agorot: number
  remaining_amount_due_agorot: number
  expires_at: string
  offer_valid_until: string | null
  redeemed_at: string | null
  supplier_id: string | null
  order_id: string | null
  user_id: string | null
  product: { name_he: string | null } | null
  supplier: { name: string | null } | null
}

function toLookup(row: VoucherLookupRow, now: Date): AdminVoucherLookup {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    productName: row.product?.name_he ?? null,
    customerName: null,
    supplierName: row.supplier?.name ?? null,
    supplierId: row.supplier_id,
    faceValueAgorot: row.face_value_agorot,
    couponPriceAgorot: row.coupon_price_agorot,
    remainingAmountDueAgorot: row.remaining_amount_due_agorot,
    expiresAt: row.expires_at,
    offerValidUntil: row.offer_valid_until ?? null,
    redeemedAt: row.redeemed_at,
    scannable: isScannable({ status: row.status, expires_at: row.expires_at }, now),
  }
}

async function loadByCode(code: string): Promise<VoucherLookupRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('vouchers')
    .select(
      `id, code, status, face_value_agorot, coupon_price_agorot,
       remaining_amount_due_agorot, expires_at, offer_valid_until, redeemed_at,
       supplier_id, order_id, user_id,
       product:products(name_he),
       supplier:suppliers(name)`,
    )
    .eq('code', code)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as VoucherLookupRow | null) ?? null
}

async function runLookupAdminVoucher(
  _: AdminVoucherLookupState,
  formData: FormData,
): Promise<AdminVoucherLookupState> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('catalog', 'read')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const allowed = await checkRateLimit(`admin-voucher-lookup:${session.userId}`, 60, 3600)
  if (!allowed) return { error: 'יותר מדי בדיקות, נסו שוב בעוד רגע' }

  const code = normalizeVoucherCode(String(formData.get('code') ?? ''))
  if (code.length < 6) return { error: 'קוד שובר לא תקין' }

  try {
    const row = await loadByCode(code)
    if (!row) return { error: 'קוד שובר לא נמצא' }
    return { voucher: toLookup(row, new Date()) }
  } catch {
    return { error: 'לא ניתן לבדוק את השובר כרגע' }
  }
}

async function runRedeemAdminVoucher(
  _: AdminVoucherRedeemState,
  formData: FormData,
): Promise<AdminVoucherRedeemState> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('orders', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const allowed = await checkRateLimit(`admin-voucher-redeem:${session.userId}`, 30, 3600)
  if (!allowed) return { error: 'יותר מדי מימושים, נסו שוב בעוד רגע' }

  const code = normalizeVoucherCode(String(formData.get('code') ?? ''))
  const reason = String(formData.get('reason') ?? '').trim()
  if (code.length < 6) return { error: 'קוד שובר לא תקין' }
  if (reason.length < 3) return { error: 'חובה לציין סיבה למימוש ידני' }

  const admin = createAdminClient()
  let before: VoucherLookupRow | null
  try {
    before = await loadByCode(code)
  } catch {
    return { error: 'לא ניתן לקרוא את השובר כרגע' }
  }
  if (!before) return { error: 'קוד שובר לא נמצא' }

  const now = new Date()
  if (!isScannable({ status: before.status, expires_at: before.expires_at }, now)) {
    return { error: 'השובר אינו ניתן למימוש' }
  }

  const redeemedAt = now.toISOString()
  const { data: updated, error: updateError } = await admin
    .from('vouchers')
    .update({
      status: 'redeemed',
      redeemed_at: redeemedAt,
      redeemed_by_user_id: session.userId,
      redeemed_by_supplier_id: before.supplier_id,
    })
    .eq('id', before.id)
    .eq('status', 'issued')
    .select('id, status, redeemed_at')
    .maybeSingle()

  if (updateError) return { error: 'מימוש השובר נכשל' }
  if (!updated) return { error: 'השובר כבר לא ניתן למימוש' }

  await admin.from('voucher_redemptions').insert({
    voucher_id: before.id,
    supplier_id: before.supplier_id,
    scanned_by: session.userId,
    code_entered: code,
    outcome: 'success',
    scan_method: 'manual',
    amount_collected_agorot: before.remaining_amount_due_agorot,
    metadata: { source: 'admin_manual', reason },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'manual_override',
    entityType: 'vouchers',
    entityId: before.id,
    changes: {
      old: { status: before.status, redeemed_at: before.redeemed_at },
      new: { status: 'redeemed', redeemed_at: redeemedAt, reason },
    },
  })

  return { success: 'השובר מומש ידנית', code: before.code }
}

/**
 * Sends the customer their coupon email again, on purpose.
 *
 * SECTIONS 29 lists `resend` among the lifecycle verbs and there was no path
 * for it: `sendVoucherEmail` runs once at the end of `finalizeOrder` and
 * nowhere else. The ordinary support request -- "I bought it and nothing
 * arrived" -- had no answer short of reading the code out over the phone.
 *
 * THE TRAP THIS HAD TO STEP OVER. The finalize send carries the Resend
 * idempotency key `voucher-email:<orderId>`, which is right there: the webhook
 * and the return page both reconcile the same order and neither should mail
 * twice. A resend that reused it would be accepted by the provider and deliver
 * nothing for 24 hours -- and the 24 hours are exactly when a resend is asked
 * for, because the customer notices within minutes. A resend two days later
 * would work. Support would have read that as a flaky button rather than an
 * off one. `sendVoucherEmail` now takes a `deliveryId` and this is the only
 * caller that passes one.
 *
 * WHAT IT DOES NOT DO. It does not reissue, does not extend, and does not touch
 * the voucher row at all. `sendVoucherEmail` reads the order's `issued`
 * vouchers, so a code that was already redeemed is not mailed out again, and an
 * order whose codes are all spent reports that there is nothing to send rather
 * than sending an empty mail.
 *
 * SUPPRESSIONS STILL WIN. The helper consults `email_suppressions` first, and
 * an address that bounced or complained is not written to because an operator
 * pressed a button. That is the whole reason the resend goes through the same
 * helper instead of composing its own mail.
 *
 * TWO RATE LIMITS, AND THE SECOND IS THE ONE THAT MATTERS. Per operator, so one
 * account cannot be used as a mailer. Per VOUCHER, because a limit that only
 * counts the operator still lets one customer be mailed thirty times, and the
 * person harmed by that is not the operator.
 */
async function runResendVoucherEmail(
  _: AdminVoucherResendState,
  formData: FormData,
): Promise<AdminVoucherResendState> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('orders', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const allowed = await checkRateLimit(`admin-voucher-resend:${session.userId}`, 30, 3600)
  if (!allowed) return { error: 'יותר מדי שליחות, נסו שוב בעוד רגע' }

  const code = normalizeVoucherCode(String(formData.get('code') ?? ''))
  const reason = String(formData.get('reason') ?? '').trim()
  if (code.length < 6) return { error: 'קוד שובר לא תקין' }
  if (reason.length < 3) return { error: 'חובה לציין סיבה לשליחה חוזרת' }

  let voucher: VoucherLookupRow | null
  try {
    voucher = await loadByCode(code)
  } catch {
    return { error: 'לא ניתן לקרוא את השובר כרגע' }
  }
  if (!voucher) return { error: 'קוד שובר לא נמצא' }
  if (!voucher.order_id || !voucher.user_id) {
    return { error: 'לשובר הזה אין הזמנה משויכת' }
  }

  const perVoucher = await checkRateLimit(`voucher-resend:${voucher.id}`, 3, 3600)
  if (!perVoucher) return { error: 'השובר הזה כבר נשלח שוב לאחרונה' }

  // A fresh id per attempt. This is the line that makes the send actually
  // happen; without it the provider answers ok and drops the mail.
  const deliveryId = crypto.randomUUID()

  const result = await sendVoucherEmail(createAdminClient(), {
    orderId: voucher.order_id,
    userId: voucher.user_id,
    siteUrl: siteUrl(),
    deliveryId,
  })

  // Audited whether or not it went out. "We tried and the address is
  // suppressed" is the answer support needs, and it is not recoverable from a
  // table that only records successes.
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'manual_override',
    entityType: 'vouchers',
    entityId: voucher.id,
    changes: {
      old: { last_delivery: null },
      new: {
        resent: result.sent,
        reason,
        delivery_id: deliveryId,
        order_id: voucher.order_id,
        failure: result.sent ? null : (result.reason ?? 'unknown'),
      },
    },
  })

  if (!result.sent) {
    // Named rather than collapsed into one message: these are three different
    // things for the person on the phone to do next.
    if (result.reason === 'suppressed') return { error: 'כתובת המייל חסומה לשליחה' }
    if (result.reason === 'no_address') return { error: 'ללקוח אין כתובת מייל' }
    if (result.reason === 'no_vouchers') return { error: 'אין שוברים פעילים בהזמנה הזאת' }
    return { error: 'השליחה נכשלה' }
  }

  return { success: 'המייל נשלח שוב', code: voucher.code }
}

/**
 * Moves a coupon's deadline later, and reports exactly why when it will not.
 *
 * =========================================================================
 * WHY THIS IS AN RPC AND NOT AN UPDATE
 * =========================================================================
 *
 * The obvious implementation is `update vouchers set expires_at = ...`, and it
 * is wrong in a way that costs money. An expired voucher has usually already
 * had what the customer paid online credited back to their wallet by step 2 of
 * the nightly job. Reviving that voucher without checking hands the customer
 * BOTH: they spend the wallet credit, then present the code, and the supplier
 * is owed for goods against a prepayment that was given back.
 *
 * Checking in TypeScript and then updating is a check and a write in two
 * transactions, and `credit_expired_vouchers()` runs between them for exactly
 * as long as it takes. `extend_voucher_expiry()` takes the voucher row FOR
 * UPDATE, so the credit job and this either serialise or one of them sees what
 * the other did. 227 adds the same `FOR UPDATE` to the credit job's cursor,
 * which is the other half of that lock.
 *
 * =========================================================================
 * IT DOES NOT MAIL THE CUSTOMER, AND THAT IS NOT AN OVERSIGHT
 * =========================================================================
 *
 * An extension is usually agreed on the phone while the customer is holding
 * the coupon, and `voucher_expiring` will reach them from the nightly job on
 * its own once the new deadline is inside a bucket -- 227's window match is
 * what makes that true for a date set only days out. Sending a fourth kind of
 * mail here would double up on that for the common case.
 *
 * =========================================================================
 * THE AUDIT ROW IS WRITTEN FOR REFUSALS TOO
 * =========================================================================
 *
 * SECTIONS 29 asks for "admin override to extend expiry with audit row". A log
 * that only records successes cannot answer the question support actually
 * brings, which is "I told the customer it was extended -- was it?". A refusal
 * is a decision the system made about somebody's money and it is recorded with
 * its reason.
 */
const EXTEND_REFUSALS: Record<string, string> = {
  not_found: 'קוד שובר לא נמצא',
  wrong_status: 'לא ניתן להאריך שובר שכבר מומש, בוטל או הוחזר',
  not_later: 'התאריך החדש אינו מאוחר מהתוקף הנוכחי',
  in_the_past: 'התאריך החדש כבר עבר',
  past_offer: 'התאריך החדש חורג מתוקף המבצע של הספק',
  already_credited: 'הסכום כבר הוחזר לארנק הלקוח, ולכן לא ניתן להחיות את השובר',
}

async function runExtendVoucherExpiry(
  _: AdminVoucherExtendState,
  formData: FormData,
): Promise<AdminVoucherExtendState> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('orders', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const allowed = await checkRateLimit(`admin-voucher-extend:${session.userId}`, 30, 3600)
  if (!allowed) return { error: 'יותר מדי הארכות, נסו שוב בעוד רגע' }

  const code = normalizeVoucherCode(String(formData.get('code') ?? ''))
  const reason = String(formData.get('reason') ?? '').trim()
  const dateInput = String(formData.get('expires_on') ?? '').trim()
  if (code.length < 6) return { error: 'קוד שובר לא תקין' }
  if (reason.length < 3) return { error: 'חובה לציין סיבה להארכת התוקף' }

  // End of the chosen day in Israel, not its midnight: an operator extending
  // "until the 31st" means the customer may use it ON the 31st.
  const newExpiry = endOfJerusalemDay(dateInput)
  if (!newExpiry) return { error: 'תאריך לא תקין' }

  let before: VoucherLookupRow | null
  try {
    before = await loadByCode(code)
  } catch {
    return { error: 'לא ניתן לקרוא את השובר כרגע' }
  }
  if (!before) return { error: 'קוד שובר לא נמצא' }

  const admin = createAdminClient()
  const result = await callPendingExpiryRpc<{
    ok?: boolean
    reason?: string
    previous_expires_at?: string
    expires_at?: string
    revived?: boolean
  }>(() =>
    admin.rpc(pendingExpiryRpc('extend_voucher_expiry'), {
      p_voucher_id: before.id,
      p_new_expires_at: newExpiry.toISOString(),
    } as never),
  )

  if (!result.ok) {
    // Named rather than collapsed. An override that answered "failed" for an
    // unapplied migration would have support retrying a button that cannot
    // work until somebody approves a file.
    if (result.missing) return { error: 'הארכת תוקף עדיין לא זמינה (מיגרציה 227 לא הוחלה)' }
    return { error: 'הארכת התוקף נכשלה' }
  }

  const outcome = result.rows[0] ?? {}

  if (outcome.ok !== true) {
    const refusal = outcome.reason ?? 'unknown'
    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'manual_override',
      entityType: 'vouchers',
      entityId: before.id,
      changes: {
        old: { expires_at: before.expires_at, status: before.status },
        new: { extended: false, refused: refusal, requested: newExpiry.toISOString(), reason },
      },
    })
    return { error: EXTEND_REFUSALS[refusal] ?? 'לא ניתן להאריך את השובר' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'manual_override',
    entityType: 'vouchers',
    entityId: before.id,
    changes: {
      old: { expires_at: outcome.previous_expires_at ?? before.expires_at, status: before.status },
      new: {
        extended: true,
        expires_at: outcome.expires_at ?? newExpiry.toISOString(),
        revived: outcome.revived === true,
        reason,
      },
    },
  })

  return {
    success: outcome.revived === true ? 'השובר הוחזר לתוקף' : 'התוקף הוארך',
    code: before.code,
  }
}

export async function lookupAdminVoucher(
  state: AdminVoucherLookupState,
  formData: FormData,
): Promise<AdminVoucherLookupState> {
  return withActionContext('admin.voucher.lookup', () => runLookupAdminVoucher(state, formData))
}

export async function redeemAdminVoucher(
  state: AdminVoucherRedeemState,
  formData: FormData,
): Promise<AdminVoucherRedeemState> {
  return withActionContext('admin.voucher.redeem', () => runRedeemAdminVoucher(state, formData))
}

export async function resendVoucherEmail(
  state: AdminVoucherResendState,
  formData: FormData,
): Promise<AdminVoucherResendState> {
  return withActionContext('admin.voucher.resend', () => runResendVoucherEmail(state, formData))
}

export async function extendVoucherExpiry(
  state: AdminVoucherExtendState,
  formData: FormData,
): Promise<AdminVoucherExtendState> {
  return withActionContext('admin.voucher.extend', () => runExtendVoucherExpiry(state, formData))
}
