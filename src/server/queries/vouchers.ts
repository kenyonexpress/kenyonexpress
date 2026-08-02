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

const VOUCHER_SELECT = `id, code, qr_payload, status,
       face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
       offer_valid_until, expires_at, issued_at, redeemed_at,
       product:products(name_he, slug),
       supplier:suppliers(name)`

export async function getCustomerVouchers(): Promise<CustomerVoucher[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('vouchers')
    .select(VOUCHER_SELECT)
    .eq('user_id', user.id)
    // active vouchers first, then most recent
    .order('status', { ascending: true })
    .order('issued_at', { ascending: false })

  return (data ?? []) as unknown as CustomerVoucher[]
}

/** One voucher owned by the current user, or null. */
export async function getCustomerVoucherById(id: string): Promise<CustomerVoucher | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('vouchers')
    .select(VOUCHER_SELECT)
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()

  return (data as unknown as CustomerVoucher | null) ?? null
}

/** True while a voucher can still be presented at a counter. */
export function isVoucherRedeemable(v: {
  status: string
  expires_at: string
}): boolean {
  return v.status === 'issued' && new Date(v.expires_at).getTime() > Date.now()
}
