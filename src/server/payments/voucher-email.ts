import { sendEmail } from '@/lib/email/resend'
import { type VoucherEmailLine, buildVoucherEmail } from '@/lib/email/voucher-email'
import { log } from '@/lib/observability/log'
import { getOrderInvoice } from '@/server/payments/invoices'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Sends the customer their coupons, once, after they are issued.
 *
 * Runs at the end of `finalizeOrder` and is incapable of failing it: the card
 * has been charged and the order closed by the time this runs, and an email
 * that will not send is not a reason to unwind a purchase. Every failure is
 * logged and swallowed, exactly like the settlement journal next to it.
 *
 * IDEMPOTENCY. finalize is replay-safe by design (the webhook and the return
 * page both reconcile the same order), so this can run more than once for one
 * order. The Resend idempotency key is `voucher-email:<orderId>`, so the second
 * run is deduplicated by the provider rather than by a flag we would have to
 * store and keep correct.
 *
 * AND WHY A RESEND MUST PASS `deliveryId`. That same key is a trap for anybody
 * adding a "send it again" button: Resend honours an idempotency key for 24
 * hours, so a resend reusing it returns ok and delivers NOTHING. The failure is
 * intermittent by construction and in the worst possible direction -- the
 * common case is a customer saying "it never arrived" minutes after buying,
 * which is squarely inside the window, while a resend two days later works
 * fine. Support would conclude the button is flaky rather than that it is off.
 *
 * So a caller that means "again, on purpose" passes `deliveryId` and the key
 * becomes `voucher-email:<orderId>:<deliveryId>`. Absent, the key is byte for
 * byte what finalize has always sent, because the replay protection there is
 * the point and must not be weakened by this.
 *
 * SUPPRESSIONS. `email_suppressions` is consulted first. An address that
 * bounced or complained must not be written to again, and sending anyway is how
 * a sending domain gets its reputation burned.
 */

export interface VoucherEmailContext {
  orderId: string
  userId: string
  siteUrl: string
  /**
   * A deliberate re-send. Distinguishes this attempt from finalize's, so the
   * provider does not silently drop it as a replay. Omit for finalize.
   */
  deliveryId?: string
}

/**
 * Exported so the resend path and its test name the same rule rather than each
 * spelling out a string that has to agree.
 */
export function voucherEmailIdempotencyKey(orderId: string, deliveryId?: string): string {
  return deliveryId ? `voucher-email:${orderId}:${deliveryId}` : `voucher-email:${orderId}`
}

/**
 * True while a voucher is a gift that has not been collected yet, and is
 * therefore not the holder's to be shown.
 *
 * Exported because three surfaces have to agree about it - this email, the
 * customer's coupon reads and the confirmation page - and a rule about who may
 * see a code is not one to spell out three times.
 *
 * `undefined` matters as much as `null` here. A caller whose select did not
 * name the gift columns gets neither, and the honest answer for a row that
 * cannot say whether it is a gift is "not a gift": that is the behaviour before
 * 108, and the alternative would blank the code on every ordinary coupon whose
 * reader simply asked for less.
 */
export function isGiftedAway(row: {
  gift_claim_token_hash?: string | null
  gift_claimed_at?: string | null
}): boolean {
  return Boolean(row.gift_claim_token_hash) && !row.gift_claimed_at
}

type VoucherRow = {
  id: string
  code: string
  gift_claim_token_hash: string | null
  gift_claimed_at: string | null
  face_value_agorot: number
  coupon_price_agorot: number
  remaining_amount_due_agorot: number
  expires_at: string
  products: { name_he: string | null } | { name_he: string | null }[] | null
  suppliers:
    | { name: string | null; address: string | null; contact_phone: string | null }
    | { name: string | null; address: string | null; contact_phone: string | null }[]
    | null
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

export async function sendVoucherEmail(
  admin: SupabaseClient,
  context: VoucherEmailContext,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', context.userId)
      .maybeSingle()

    const to = (profile as { email?: string | null } | null)?.email
    if (!to) return { sent: false, reason: 'no_address' }

    const { data: suppressed } = await admin
      .from('email_suppressions')
      .select('email')
      .eq('email', to)
      .maybeSingle()
    if (suppressed) return { sent: false, reason: 'suppressed' }

    const { data: rows } = await admin
      .from('vouchers')
      .select(
        `id, code, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot, expires_at,
         gift_claim_token_hash, gift_claimed_at,
         products(name_he),
         suppliers(name, address, contact_phone)`,
      )
      .eq('order_id', context.orderId)
      .eq('status', 'issued')
      .order('issued_at', { ascending: true })

    const allVouchers = (rows ?? []) as unknown as VoucherRow[]
    // A physical-only order issues no vouchers, and there is nothing to send.
    if (allVouchers.length === 0) return { sent: false, reason: 'no_vouchers' }

    /**
     * GIFTED COUPONS ARE REMOVED FROM THIS EMAIL, and this is the fix for the
     * defect SECTIONS 33 words as "buyer sees order but not the code".
     *
     * `finalizeOrder` calls `sendOrderGifts` and then calls this, and this read
     * is scoped to the ORDER rather than to ownership. A gifted voucher stays
     * owned by the buyer until it is claimed - which is deliberate, the buyer
     * paid and a refund belongs to them - so before this filter existed the
     * buyer received the recipient's coupon code and QR by email, minutes after
     * paying. The gift was a wrapped box with the lid off: nothing stopped the
     * buyer walking into the business and redeeming the present they had just
     * bought, and the recipient would find a dead link.
     *
     * `gift_claim_token_hash IS NOT NULL` is the test, not `gift_sent_at`: the
     * hash is what makes a voucher claimable by somebody else, and it is
     * written in the same guarded UPDATE as the timestamp.
     *
     * ONCE CLAIMED, THE ROW LEAVES ON ITS OWN. `gift_claimed_at` moves
     * `user_id` to the recipient, and this function is called only from
     * finalize with the BUYER's id - so a claimed gift is no longer in any
     * email this sends. There is nothing to add for that case.
     *
     * The column may not exist (108 is applied, but the reader must not assume
     * it): `undefined` is not `null`, so a row without the field is treated as
     * not a gift, which is the behaviour before gifts existed.
     */
    const vouchers = allVouchers.filter((row) => !isGiftedAway(row))
    if (vouchers.length === 0) {
      // Every coupon on the order went to somebody else. The recipient has
      // their own email; sending the buyer an empty coupon list would be a
      // message with nothing in it.
      log.info('email.voucher_all_gifted', { orderId: context.orderId })
      return { sent: false, reason: 'all_gifted' }
    }

    const lines: VoucherEmailLine[] = vouchers.map((row) => {
      const product = firstOf(row.products)
      const supplier = firstOf(row.suppliers)
      return {
        id: row.id,
        code: row.code,
        productName: product?.name_he ?? null,
        supplierName: supplier?.name ?? null,
        supplierAddress: supplier?.address ?? null,
        supplierPhone: supplier?.contact_phone ?? null,
        faceValueAgorot: row.face_value_agorot,
        couponPriceAgorot: row.coupon_price_agorot,
        remainingDueAgorot: row.remaining_amount_due_agorot,
        expiresAt: row.expires_at,
      }
    })

    // finalize issues the invoice before it sends this, so in the ordinary case
    // the number is already here. When it is not - provider down, credentials
    // not set - the block is simply absent, rather than a link to a document
    // that does not exist yet.
    const invoice = await getOrderInvoice(admin, context.orderId)

    const email = buildVoucherEmail({
      customerName: (profile as { full_name?: string | null } | null)?.full_name ?? null,
      orderId: context.orderId,
      vouchers: lines,
      siteUrl: context.siteUrl,
      invoiceNumber: invoice?.documentNumber ?? null,
    })

    const result = await sendEmail({
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: voucherEmailIdempotencyKey(context.orderId, context.deliveryId),
    })

    if (!result.ok) return { sent: false, reason: result.reason }
    return { sent: true }
  } catch (error) {
    log.error('email.voucher_send_failed', { err: error })
    return { sent: false, reason: 'exception' }
  }
}
