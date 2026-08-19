import { ilsColumnToAgorot } from '@/lib/account/format'
import { orFail } from '@/lib/catalogue-read'
import { type Agorot, agorot } from '@/lib/money'
import { readWalletAccountAgorot } from '@/lib/supabase/optional-columns'
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
  /** Integer agorot. The wallet is internal credit and never leaves the system. */
  balanceAgorot: Agorot
  accountId: string | null
}

export type WalletDirection = 'credit' | 'debit'

export interface WalletLedgerRow {
  id: string
  direction: WalletDirection
  /** Integer agorot, signed: negative for a debit. */
  signedAmountAgorot: Agorot
  /** Integer agorot, unsigned magnitude. */
  amountAgorot: Agorot
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

  const data = orFail(
    await supabase
      .from('profiles')
      .select('id, email, full_name, phone, avatar_url')
      .eq('id', user.id)
      .maybeSingle(),
    'account.profile_read_failed',
    { userId: user.id },
  )

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
  if (!user) return { balanceAgorot: agorot(0), accountId: null }

  // Probed, not named. This selected `balance_agorot`, which the hosted project
  // does not have, so the select 42703'd and the account area showed every
  // customer an empty wallet. Naming `balance_ils` instead would just move the
  // same failure onto a migrated database.
  const { accountId, balanceAgorot } = await readWalletAccountAgorot(
    (select, ids) => supabase.from('wallet_accounts').select(select).eq('user_id', ids[0]) as never,
    user.id,
  )

  return {
    balanceAgorot: agorot(balanceAgorot),
    accountId,
  }
}

export async function getWalletLedger(limit = 100): Promise<WalletLedgerRow[]> {
  const supabase = await createClient()
  // The ledger is the customer's record of their own money. A discarded error
  // rendered it as "no movements yet", which for someone checking where a
  // refund went is not a slower answer, it is a wrong one.
  const data = orFail(
    await supabase
      .from('v_wallet_ledger')
      .select('id, direction, signed_amount_ils, amount_ils, reason, order_id, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    'account.wallet_ledger_read_failed',
  )

  return (data ?? []).map((row) => ({
    id: row.id,
    direction: row.direction === 'credit' ? 'credit' : 'debit',
    // `v_wallet_ledger` still exposes decimal `*_ils`; parsed, not multiplied.
    signedAmountAgorot: ilsColumnToAgorot(row.signed_amount_ils),
    amountAgorot: ilsColumnToAgorot(row.amount_ils),
    reason: row.reason,
    orderId: row.order_id,
    createdAt: row.created_at,
  }))
}

export async function getMyAddresses(): Promise<AccountAddress[]> {
  const supabase = await createClient()
  const data = orFail(
    await supabase
      .from('user_addresses')
      .select(
        'id, full_name, phone, street, street_number, apartment, entrance, floor, city, zip, notes_for_courier, is_default',
      )
      .is('deleted_at', null)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false }),
    'account.addresses_read_failed',
  )

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
  const data = orFail(
    await supabase
      .from('payment_tokens')
      .select('id, last_4, card_brand, expiry_month, expiry_year, is_default, created_at')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false }),
    'account.payment_tokens_read_failed',
  )

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
 * `getMyCoupons` used to live here, as the second read of `vouchers` in the
 * codebase. It backed /account/coupons and the overview tile while
 * `getCustomerVouchers` in queries/vouchers.ts backed /account/vouchers, and
 * the two selected different columns and mapped them to different units. Both
 * screens now use `getCustomerVouchers`, which is the one that carries the
 * voucher id, and therefore the one that can link to /coupon/[id].
 */
