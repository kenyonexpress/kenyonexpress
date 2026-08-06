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
 * SUPPRESSIONS. `email_suppressions` is consulted first. An address that
 * bounced or complained must not be written to again, and sending anyway is how
 * a sending domain gets its reputation burned.
 */

export interface VoucherEmailContext {
  orderId: string
  userId: string
  siteUrl: string
}

type VoucherRow = {
  id: string
  code: string
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
         products(name_he),
         suppliers(name, address, contact_phone)`,
      )
      .eq('order_id', context.orderId)
      .eq('status', 'issued')
      .order('issued_at', { ascending: true })

    const vouchers = (rows ?? []) as unknown as VoucherRow[]
    // A physical-only order issues no vouchers, and there is nothing to send.
    if (vouchers.length === 0) return { sent: false, reason: 'no_vouchers' }

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
      idempotencyKey: `voucher-email:${context.orderId}`,
    })

    if (!result.ok) return { sent: false, reason: result.reason }
    return { sent: true }
  } catch (error) {
    log.error('email.voucher_send_failed', { err: error })
    return { sent: false, reason: 'exception' }
  }
}
