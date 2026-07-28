import { createClient } from '@/lib/supabase/server'

/**
 * Account-area reads.
 *
 * These deliberately use the REQUEST-SCOPED client, not the admin client, so
 * every query is enforced by RLS on `auth.uid()` rather than by a filter we
 * remembered to write. Migration 052 added the owner policies that make this
 * possible (wallet_entries and payment_tokens were previously unreadable or
 * undeletable by their own owner).
 */

export interface AccountProfile {
  id: string
  email: string
  fullName: string | null
  phone: string | null
  avatarUrl: string | null
}

export interface WalletSummary {
  balanceIls: number
  accountId: string | null
}

export type WalletDirection = 'credit' | 'debit'

export interface WalletLedgerRow {
  id: string
  direction: WalletDirection
  signedAmountIls: number
  amountIls: number
  reason: string
  orderId: string | null
  createdAt: string
}

export interface AccountAddress {
  id: string
  fullName: string
  phone: string
  street: string
  streetNumber: string | null
  apartment: string | null
  entrance: string | null
  floor: string | null
  city: string
  zip: string | null
  notesForCourier: string | null
  isDefault: boolean
}

export interface AccountPaymentToken {
  id: string
  last4: string | null
  cardBrand: string | null
  expiryMonth: number | null
  expiryYear: number | null
  isDefault: boolean
  createdAt: string
}

export interface AccountCoupon {
  code: string
  status: string
  expiresAt: string
  faceValueIls: number
  platformPaidIls: number
  collectAmountIls: number
  redeemedAt: string | null
  productName: string | null
}

/**
 * Hebrew labels for the ledger `reason` codes.
 *
 * These MUST match the strings finalize.ts passes as `p_reason`, which are
 * `order_cashback` and `order_spend` (verified against the live ledger). An
 * unknown code falls through to itself rather than to a wrong label.
 */
export const WALLET_REASON_LABELS: Record<string, string> = {
  order_cashback: 'קאשבק על רכישה',
  order_spend: 'שימוש בארנק',
  order_refund: 'החזר על ביטול',
  admin_credit: 'זיכוי ידני',
  coupon_expired: 'קרדיט על קופון שפג',
}

export function walletReasonLabel(reason: string): string {
  return WALLET_REASON_LABELS[reason] ?? reason
}

export async function getAccountProfile(): Promise<AccountProfile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    phone: data.phone,
    avatarUrl: data.avatar_url,
  }
}

export async function getWalletSummary(): Promise<WalletSummary> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { balanceIls: 0, accountId: null }

  const { data } = await supabase
    .from('wallet_accounts')
    // balance_agorot since 059; the old name took the whole select down with
    // 42703 and the account page reported an empty wallet to everybody.
    .select('id, balance_agorot')
    .eq('user_id', user.id)
    .maybeSingle()

  return {
    balanceIls: Number(data?.balance_agorot ?? 0) / 100,
    accountId: data?.id ?? null,
  }
}

export async function getWalletLedger(limit = 100): Promise<WalletLedgerRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('v_wallet_ledger')
    .select('id, direction, signed_amount_ils, amount_ils, reason, order_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((row) => ({
    id: row.id,
    direction: row.direction === 'credit' ? 'credit' : 'debit',
    signedAmountIls: Number(row.signed_amount_ils ?? 0),
    amountIls: Number(row.amount_ils ?? 0),
    reason: row.reason,
    orderId: row.order_id,
    createdAt: row.created_at,
  }))
}

export async function getMyAddresses(): Promise<AccountAddress[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_addresses')
    .select(
      'id, full_name, phone, street, street_number, apartment, entrance, floor, city, zip, notes_for_courier, is_default',
    )
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  return (data ?? []).map((a) => ({
    id: a.id,
    fullName: a.full_name,
    phone: a.phone,
    street: a.street,
    streetNumber: a.street_number,
    apartment: a.apartment,
    entrance: a.entrance,
    floor: a.floor,
    city: a.city,
    zip: a.zip,
    notesForCourier: a.notes_for_courier,
    isDefault: a.is_default,
  }))
}

export async function getMyPaymentTokens(): Promise<AccountPaymentToken[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('payment_tokens')
    .select('id, last_4, card_brand, expiry_month, expiry_year, is_default, created_at')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  return (data ?? []).map((t) => ({
    id: t.id,
    last4: t.last_4,
    cardBrand: t.card_brand,
    expiryMonth: t.expiry_month,
    expiryYear: t.expiry_year,
    isDefault: t.is_default,
    createdAt: t.created_at,
  }))
}

/**
 * The customer's coupons, from `vouchers`.
 *
 * This read `coupon_codes` until 2026-07-28. That is the pre-voucher instance
 * table: nothing has written it since finalize.ts moved to issueVoucher, and
 * 059 renamed the money columns it named on top of that. So it returned nothing
 * for everybody, and /account and /account/coupons both showed a customer no
 * coupons at all while /account/vouchers, reading the right table, showed them.
 *
 * RLS scopes the rows (073 vouchers_owner_read, user_id = auth.uid()), which is
 * why there is no user filter here and why the request-scoped client is used
 * rather than the service role.
 */
export async function getMyCoupons(): Promise<AccountCoupon[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vouchers')
    .select(
      'code, status, expires_at, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot, redeemed_at, products(name_he)',
    )
    .order('issued_at', { ascending: false })
    .limit(100)

  return (data ?? []).map((c) => {
    const product = c.products as { name_he: string } | { name_he: string }[] | null
    const productName = Array.isArray(product)
      ? (product[0]?.name_he ?? null)
      : (product?.name_he ?? null)
    return {
      code: c.code,
      status: c.status,
      expiresAt: c.expires_at,
      faceValueIls: Number(c.face_value_agorot ?? 0) / 100,
      // What the customer paid us online, which is the whole prepayment under
      // model 035ef8e.
      platformPaidIls: Number(c.coupon_price_agorot ?? 0) / 100,
      // What the business collects in cash at the counter. Never reaches us.
      collectAmountIls: Number(c.remaining_amount_due_agorot ?? 0) / 100,
      redeemedAt: c.redeemed_at,
      productName,
    }
  })
}
