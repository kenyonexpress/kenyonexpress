'use server'

import { hashGiftClaimToken, isWellFormedGiftToken } from '@/lib/gifts/claim-token'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Claiming a gifted coupon: the one place `vouchers.user_id` changes hands.
 *
 * WHAT MOVES AND WHAT DOES NOT
 *
 * Ownership of the voucher, and nothing else. No money moves: the sale was
 * settled when the buyer paid, the supplier's share was decided then, and the
 * platform's obligation afterwards is the same one to a different person. In
 * particular this touches NO wallet column - which is what makes this goal
 * possible while `142_money_integer_fix_in_place.sql` is unapplied.
 *
 * `gifted_by_user_id` is written at the same moment, because after the update
 * `user_id` is no longer the buyer and the link to whoever paid - the person a
 * refund and the receipt belong to - would otherwise be gone.
 *
 * WHAT THE GUARDS ARE FOR
 *
 * The update is conditional on `gift_claimed_at IS NULL` and on the token hash,
 * in one statement. Two people opening the same link at the same moment means
 * one row updated and one no-op, decided by Postgres, rather than by whichever
 * request read first. A claimed gift then reports "already claimed" instead of
 * silently transferring again.
 *
 * A voucher that is redeemed, expired, refunded or cancelled is NOT claimable:
 * transferring it would hand someone a coupon that cannot be used, which reads
 * as a broken gift rather than as a used one.
 */

export type ClaimGiftResult =
  | { ok: true; voucherId: string; alreadyMine: boolean }
  | { ok: false; error: string; code: 'BAD_TOKEN' | 'NOT_FOUND' | 'CLAIMED' | 'UNUSABLE' | 'AUTH' }

async function runClaimGift(token: string): Promise<ClaimGiftResult> {
  if (!isWellFormedGiftToken(token)) {
    return { ok: false, error: 'קישור המתנה אינו תקין', code: 'BAD_TOKEN' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר כדי לקבל את המתנה', code: 'AUTH' }

  const admin = createAdminClient()
  const hash = hashGiftClaimToken(token)

  const { data: row } = await admin
    .from('vouchers')
    .select('id, user_id, status, expires_at, gift_claimed_at')
    .eq('gift_claim_token_hash', hash)
    .maybeSingle()
  const voucher = row as unknown as {
    id: string
    user_id: string
    status: string
    expires_at: string | null
    gift_claimed_at: string | null
  } | null

  if (!voucher) return { ok: false, error: 'קישור המתנה אינו תקין', code: 'NOT_FOUND' }

  if (voucher.gift_claimed_at) {
    // Opening your own claimed gift again is not an error, it is a bookmark.
    if (voucher.user_id === user.id) {
      return { ok: true, voucherId: voucher.id, alreadyMine: true }
    }
    return { ok: false, error: 'המתנה כבר נאספה', code: 'CLAIMED' }
  }

  if (voucher.status !== 'issued') {
    return { ok: false, error: 'לא ניתן לקבל את הקופון הזה', code: 'UNUSABLE' }
  }
  if (voucher.expires_at && new Date(voucher.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: 'תוקף הקופון פג', code: 'UNUSABLE' }
  }

  const { data: claimed, error } = await admin
    .from('vouchers')
    .update({
      user_id: user.id,
      gifted_by_user_id: voucher.user_id,
      gift_claimed_at: new Date().toISOString(),
    } as never)
    .eq('id', voucher.id)
    .eq('gift_claim_token_hash', hash)
    .is('gift_claimed_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    log.error('gifts.claim_failed', { voucher_id: voucher.id, err: error.message })
    return { ok: false, error: 'קבלת המתנה נכשלה, נסו שוב', code: 'NOT_FOUND' }
  }
  if (!claimed) {
    // Lost the race with another claim of the same link.
    return { ok: false, error: 'המתנה כבר נאספה', code: 'CLAIMED' }
  }

  log.info('gifts.claimed', { voucher_id: voucher.id })
  revalidatePath('/account/coupons')
  return { ok: true, voucherId: voucher.id, alreadyMine: false }
}

export async function claimGift(token: string): Promise<ClaimGiftResult> {
  return withActionContext('gifts.claim', () => runClaimGift(token))
}

export interface GiftPreview {
  productName: string | null
  supplierName: string | null
  recipientName: string | null
  message: string | null
  expiresAt: string | null
  claimed: boolean
  usable: boolean
}

/**
 * What the claim page shows before anyone signs in.
 *
 * Deliberately says nothing the link's holder does not already have: the
 * product, the business and the greeting. No code, no QR, no order, no buyer
 * name and no email address - those arrive with ownership, not with the link,
 * and a forwarded link should not expose the person who paid.
 */
export async function loadGiftPreview(token: string): Promise<GiftPreview | null> {
  return withActionContext('gifts.preview', () => runLoadGiftPreview(token))
}

async function runLoadGiftPreview(token: string): Promise<GiftPreview | null> {
  if (!isWellFormedGiftToken(token)) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('vouchers')
    .select(
      'status, expires_at, gift_recipient_name, gift_message, gift_claimed_at, products(name_he), suppliers(name)',
    )
    .eq('gift_claim_token_hash', hashGiftClaimToken(token))
    .maybeSingle()
  if (!data) return null

  const row = data as unknown as {
    status: string
    expires_at: string | null
    gift_recipient_name: string | null
    gift_message: string | null
    gift_claimed_at: string | null
    products: { name_he: string | null } | { name_he: string | null }[] | null
    suppliers: { name: string | null } | { name: string | null }[] | null
  }
  const first = <T>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value

  const expired = row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false

  return {
    productName: first(row.products)?.name_he ?? null,
    supplierName: first(row.suppliers)?.name ?? null,
    recipientName: row.gift_recipient_name,
    message: row.gift_message,
    expiresAt: row.expires_at,
    claimed: row.gift_claimed_at != null,
    usable: row.status === 'issued' && !expired,
  }
}
