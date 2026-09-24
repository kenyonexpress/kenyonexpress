'use server'

import {
  createGiftClaimToken,
  hashGiftClaimToken,
  isWellFormedGiftToken,
} from '@/lib/gifts/claim-token'
import {
  type GiftTransferInput,
  giftTransferSchema,
  isVoucherId,
  transferEligibility,
} from '@/lib/gifts/transfer'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkUserRateLimit } from '@/lib/utils/rate-limit'
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

/**
 * SENDING ON A COUPON YOU OWN.
 *
 * The purchase-time gift (`sendOrderGifts`) and this are the same shape on the
 * row: recipient, greeting, a hashed claim token, `gift_sent_at` stamped at
 * queue time, one `voucher_gifted` outbox row. What differs is who asks and
 * when: the owner, from their account, for a coupon that is already theirs -
 * which may itself have arrived as a gift.
 *
 * NOTHING MOVES UNTIL THE CLAIM. The coupon stays the sender's until the
 * recipient opens the link and signs in; `withholdGiftedCode` blanks the code
 * on the sender's screens from the moment the token exists, so the sender
 * cannot present at a counter a coupon they have promised to somebody else.
 * A sender who changes their mind revokes the link (`revokeVoucherTransfer`),
 * and the code comes back.
 *
 * THE GUARDS ARE IN THE UPDATE, not only in the read before it. Ownership,
 * `status = issued`, and "no unclaimed link exists" are all conditions of the
 * one statement, so two transfers of the same coupon racing each other end
 * with one token minted and one refusal, decided by Postgres.
 *
 * `gift_deliver_at` (pending 226) is not written here: naming it on a
 * database without it is a 42703 that would fail the transfer. A transfer is
 * immediate; the scheduled send exists at checkout only.
 */

export type TransferVoucherResult =
  | { ok: true; voucherId: string }
  | {
      ok: false
      error: string
      code:
        | 'AUTH'
        | 'INPUT'
        | 'NOT_FOUND'
        | 'NOT_ISSUED'
        | 'EXPIRED'
        | 'PENDING_GIFT'
        | 'RATE_LIMITED'
        | 'FAILED'
    }

/** The outbox key: one per link, not one per voucher, because a coupon can be sent on more than once over its life. */
function transferDedupeKey(voucherId: string, hash: string): string {
  return `gift:${voucherId}:${hash.slice(0, 16)}`
}

async function runTransferVoucher(
  voucherId: string,
  input: GiftTransferInput,
): Promise<TransferVoucherResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר כדי להעביר קופון', code: 'AUTH' }

  if (!isVoucherId(voucherId)) {
    return { ok: false, error: 'הקופון לא נמצא', code: 'NOT_FOUND' }
  }
  const parsed = giftTransferSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'הפרטים אינם תקינים',
      code: 'INPUT',
    }
  }

  // Every transfer sends one email to an address the sender typed. Twenty an
  // hour is more than a person gives away and far fewer than a spammer needs.
  const allowed = await checkUserRateLimit(user.id, 'gift_transfer', 20, 3600)
  if (!allowed) {
    return {
      ok: false,
      error: 'יותר מדי העברות בשעה האחרונה. נסו שוב מאוחר יותר',
      code: 'RATE_LIMITED',
    }
  }

  const admin = createAdminClient()
  const { data: row, error: readError } = await admin
    .from('vouchers')
    .select(
      'id, user_id, status, expires_at, product_id, gift_claim_token_hash, gift_claimed_at, gift_sent_at, gift_recipient_name, gift_recipient_email, gift_message',
    )
    .eq('id', voucherId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (readError) {
    // A failed read is not "no such coupon": say so, rather than telling the
    // owner their coupon does not exist.
    log.error('gifts.transfer_read_failed', { voucher_id: voucherId, err: readError.message })
    return { ok: false, error: 'לא הצלחנו לקרוא את הקופון, נסו שוב', code: 'FAILED' }
  }
  const voucher = row as unknown as {
    id: string
    user_id: string
    status: string
    expires_at: string | null
    product_id: string | null
    gift_claim_token_hash: string | null
    gift_claimed_at: string | null
    gift_sent_at: string | null
    gift_recipient_name: string | null
    gift_recipient_email: string | null
    gift_message: string | null
  } | null
  if (!voucher) return { ok: false, error: 'הקופון לא נמצא', code: 'NOT_FOUND' }

  const eligible = transferEligibility(voucher)
  if (!eligible.ok) {
    const error =
      eligible.code === 'PENDING_GIFT'
        ? 'הקופון כבר נשלח וממתין לאיסוף. אפשר לבטל את השליחה ואז לשלוח שוב'
        : eligible.code === 'EXPIRED'
          ? 'תוקף הקופון פג'
          : 'לא ניתן להעביר את הקופון הזה'
    return { ok: false, error, code: eligible.code }
  }

  const { token, hash } = createGiftClaimToken()
  const now = new Date().toISOString()
  const recipientName = parsed.data.recipientName?.trim() || null
  const message = parsed.data.message?.trim() || null

  const { data: updated, error: updateError } = await admin
    .from('vouchers')
    .update({
      gift_recipient_name: recipientName,
      gift_recipient_email: parsed.data.recipientEmail,
      gift_message: message,
      gift_claim_token_hash: hash,
      gift_claimed_at: null,
      gift_sent_at: now,
    } as never)
    .eq('id', voucher.id)
    .eq('user_id', user.id)
    .eq('status', 'issued')
    // Either no link was ever minted, or the last one was claimed (that is how
    // the sender got the coupon). An unclaimed link blocks: see transferEligibility.
    .or('gift_claim_token_hash.is.null,gift_claimed_at.not.is.null')
    .select('id')
    .maybeSingle()

  if (updateError) {
    log.error('gifts.transfer_update_failed', { voucher_id: voucher.id, err: updateError.message })
    return { ok: false, error: 'ההעברה נכשלה, נסו שוב', code: 'FAILED' }
  }
  if (!updated) {
    // Lost the race with another transfer or a redemption of the same coupon.
    return { ok: false, error: 'הקופון כבר נשלח או נוצל', code: 'PENDING_GIFT' }
  }

  const [{ data: sender }, { data: product }] = await Promise.all([
    admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    voucher.product_id
      ? admin.from('products').select('name_he').eq('id', voucher.product_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const { error: queueError } = await admin.from('notification_outbox').insert({
    kind: 'voucher_gifted',
    recipient_email: parsed.data.recipientEmail,
    payload: {
      product_name: (product as { name_he: string | null } | null)?.name_he ?? null,
      sender_name: (sender as { full_name: string | null } | null)?.full_name ?? null,
      recipient_name: recipientName,
      gift_message: message,
      // The RAW token: the only place it is written. The outbox row is
      // service-role only, same as the purchase-time gift.
      claim_token: token,
      expires_at: voucher.expires_at,
    },
    dedupe_key: transferDedupeKey(voucher.id, hash),
  } as never)

  if (queueError && !queueError.message.includes('duplicate')) {
    // A link nobody will receive is worse than no link: put the row back the
    // way it was so the sender keeps their code and can try again.
    log.error('gifts.transfer_queue_failed', { voucher_id: voucher.id, err: queueError.message })
    await admin
      .from('vouchers')
      .update({
        gift_recipient_name: voucher.gift_recipient_name,
        gift_recipient_email: voucher.gift_recipient_email,
        gift_message: voucher.gift_message,
        gift_claim_token_hash: voucher.gift_claim_token_hash,
        gift_claimed_at: voucher.gift_claimed_at,
        gift_sent_at: voucher.gift_sent_at,
      } as never)
      .eq('id', voucher.id)
      .eq('gift_claim_token_hash', hash)
    return { ok: false, error: 'שליחת המייל נכשלה, נסו שוב', code: 'FAILED' }
  }

  log.info('gifts.transferred', { voucher_id: voucher.id })
  revalidatePath('/account/coupons')
  revalidatePath(`/coupon/${voucher.id}`)
  return { ok: true, voucherId: voucher.id }
}

export async function transferVoucher(
  voucherId: string,
  input: GiftTransferInput,
): Promise<TransferVoucherResult> {
  return withActionContext('gifts.transfer', () => runTransferVoucher(voucherId, input))
}

export type RevokeTransferResult =
  | { ok: true }
  | { ok: false; error: string; code: 'AUTH' | 'NOT_FOUND' | 'CLAIMED' | 'FAILED' }

/**
 * Takes an unclaimed link back. The token is cleared, so the link in the
 * recipient's inbox answers "not valid" from now on, and the code returns to
 * the sender's screens. The outbox row is marked dead if it has not gone out
 * yet, so a mail is not sent for a link that is already dead.
 *
 * `gift_sent_at` is deliberately LEFT SET. It is the idempotency guard
 * `sendOrderGifts` replays against; clearing it on a coupon that was bought as
 * a gift would let a replayed finalize mint a fresh link to the original
 * recipient. Eligibility for the next transfer keys on the token, not on it.
 */
async function runRevokeVoucherTransfer(voucherId: string): Promise<RevokeTransferResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר', code: 'AUTH' }
  if (!isVoucherId(voucherId)) return { ok: false, error: 'הקופון לא נמצא', code: 'NOT_FOUND' }

  const admin = createAdminClient()
  const { data: row, error: readError } = await admin
    .from('vouchers')
    .select('id, gift_claim_token_hash, gift_claimed_at')
    .eq('id', voucherId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (readError) {
    log.error('gifts.revoke_read_failed', { voucher_id: voucherId, err: readError.message })
    return { ok: false, error: 'לא הצלחנו לקרוא את הקופון, נסו שוב', code: 'FAILED' }
  }
  const voucher = row as unknown as {
    id: string
    gift_claim_token_hash: string | null
    gift_claimed_at: string | null
  } | null
  if (!voucher || !voucher.gift_claim_token_hash) {
    return { ok: false, error: 'אין שליחה לבטל', code: 'NOT_FOUND' }
  }
  if (voucher.gift_claimed_at) {
    return { ok: false, error: 'המתנה כבר נאספה ולא ניתן לבטל אותה', code: 'CLAIMED' }
  }

  const hash = voucher.gift_claim_token_hash
  const { data: cleared, error } = await admin
    .from('vouchers')
    .update({
      gift_claim_token_hash: null,
      gift_recipient_name: null,
      gift_recipient_email: null,
      gift_message: null,
    } as never)
    .eq('id', voucher.id)
    .eq('user_id', user.id)
    .eq('gift_claim_token_hash', hash)
    .is('gift_claimed_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    log.error('gifts.revoke_failed', { voucher_id: voucher.id, err: error.message })
    return { ok: false, error: 'הביטול נכשל, נסו שוב', code: 'FAILED' }
  }
  if (!cleared) return { ok: false, error: 'המתנה כבר נאספה ולא ניתן לבטל אותה', code: 'CLAIMED' }

  // Best effort: a mail still waiting in the outbox for this exact link is not
  // sent. Both dedupe keys are tried because a purchase-time gift is keyed
  // `gift:<id>` and a transfer `gift:<id>:<hash prefix>`.
  await admin
    .from('notification_outbox')
    .update({ status: 'dead', last_error: 'gift revoked by the sender' } as never)
    .in('dedupe_key', [`gift:${voucher.id}`, transferDedupeKey(voucher.id, hash)])
    .eq('status', 'pending')

  log.info('gifts.revoked', { voucher_id: voucher.id })
  revalidatePath('/account/coupons')
  revalidatePath(`/coupon/${voucher.id}`)
  return { ok: true }
}

export async function revokeVoucherTransfer(voucherId: string): Promise<RevokeTransferResult> {
  return withActionContext('gifts.revoke', () => runRevokeVoucherTransfer(voucherId))
}
