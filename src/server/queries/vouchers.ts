import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Customer-facing voucher reads. RLS (051 vouchers_owner_read) already scopes
 * rows to auth.uid(); the user_id filter here is defence in depth, not the
 * boundary.
 */

export interface CustomerVoucher {
  id: string
  code: string
  qr_payload: string
  status: 'issued' | 'redeemed' | 'expired' | 'cancelled' | 'refunded'
  face_value_agorot: number
  coupon_price_agorot: number
  remaining_amount_due_agorot: number
  offer_valid_until: string
  expires_at: string
  issued_at: string
  redeemed_at: string | null
  product: { name_he: string | null; slug: string | null } | null
  supplier: { name: string | null } | null
}

export async function getCustomerVouchers(): Promise<CustomerVoucher[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('vouchers')
    .select(
      `id, code, qr_payload, status,
       face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
       offer_valid_until, expires_at, issued_at, redeemed_at,
       product:products(name_he, slug),
       supplier:suppliers(name)`,
    )
    .eq('user_id', user.id)
    // active vouchers first, then most recent
    .order('status', { ascending: true })
    .order('issued_at', { ascending: false })

  return (data ?? []) as unknown as CustomerVoucher[]
}

/** True while a voucher can still be presented at a counter. */
export function isVoucherRedeemable(v: {
  status: string
  expires_at: string
}): boolean {
  return v.status === 'issued' && new Date(v.expires_at).getTime() > Date.now()
}

/** What the counter is shown before it commits to burning a voucher. */
export interface RedemptionPreview {
  id: string
  code: string
  status: CustomerVoucher['status']
  supplierId: string
  faceValueAgorot: number
  couponPriceAgorot: number
  remainingAmountDueAgorot: number
  expiresAt: string
  redeemedAt: string | null
  productName: string | null
  customerName: string | null
}

/**
 * Loads a voucher for the confirm step of a supplier redemption, and returns it
 * only when it belongs to one of `supplierIds`.
 *
 * The service-role client is deliberate and is not a shortcut around RLS. The
 * supplier policy on vouchers (073, vouchers_supplier_read_redeemed) exposes a
 * voucher only AFTER it has been redeemed by that supplier, which is correct:
 * it stops a supplier session from reading the outstanding-voucher table. But a
 * confirm screen has to show the customer's name and the balance to collect
 * BEFORE the scan, so it reads with the service role and re-imposes the
 * ownership check here in code.
 *
 * This is a display path only. It decides nothing: redeem_voucher() re-derives
 * the supplier from supplier_members inside the transaction that flips the
 * status, so a mistake here cannot redeem anything that function would refuse.
 */
export async function getVoucherForRedemption(
  code: string,
  supplierIds: string[],
): Promise<RedemptionPreview | null> {
  if (supplierIds.length === 0) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('vouchers')
    .select(
      `id, code, status, supplier_id, user_id,
       face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
       expires_at, redeemed_at,
       product:products(name_he)`,
    )
    .eq('code', code)
    .maybeSingle()

  if (!data) return null
  // Anti-enumeration: another supplier's voucher is indistinguishable from one
  // that does not exist, which is the same collapse redeem_voucher() performs.
  if (!supplierIds.includes(data.supplier_id)) return null

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', data.user_id)
    .maybeSingle()

  const product = data.product as { name_he: string | null } | { name_he: string | null }[] | null
  const productName = Array.isArray(product)
    ? (product[0]?.name_he ?? null)
    : (product?.name_he ?? null)

  return {
    id: data.id,
    code: data.code,
    status: data.status as CustomerVoucher['status'],
    supplierId: data.supplier_id,
    faceValueAgorot: data.face_value_agorot,
    couponPriceAgorot: data.coupon_price_agorot,
    remainingAmountDueAgorot: data.remaining_amount_due_agorot,
    expiresAt: data.expires_at,
    redeemedAt: data.redeemed_at,
    productName,
    customerName: profile?.full_name ?? null,
  }
}
