import { z } from 'zod'

/**
 * Passing a coupon you already own to somebody else.
 *
 * The same mechanism as a gift bought at checkout, applied after the fact: the
 * voucher gains a claim token, the recipient gets the `voucher_gifted` mail,
 * and ownership moves in `claimGift` when they open the link and sign in. It
 * has to be the same mechanism, because `claimGift` is the ONE place
 * `vouchers.user_id` changes hands and a second path would be a second set of
 * guards to keep in step.
 *
 * Pure: what may be transferred, and what a transfer request must contain. The
 * database work is in `server/actions/gifts.ts`.
 */

export type TransferRefusal = 'NOT_ISSUED' | 'EXPIRED' | 'PENDING_GIFT'

export type TransferEligibility = { ok: true } | { ok: false; code: TransferRefusal }

/**
 * A voucher may be sent on when it is still usable and is not already on its
 * way to somebody. Same three refusals as the claim side, in the same order,
 * so the two ends of a transfer agree about what a usable coupon is.
 *
 * `PENDING_GIFT` is a claim token that exists and has not been claimed: the
 * previous recipient still holds a working link, and minting a second one
 * would leave two people with a link to one coupon. The sender has to revoke
 * the first before sending again. A token that WAS claimed does not block:
 * that is the history of how the current owner got the coupon.
 */
export function transferEligibility(
  voucher: {
    status: string
    expires_at: string | null
    gift_claim_token_hash?: string | null
    gift_claimed_at?: string | null
  },
  now: Date = new Date(),
): TransferEligibility {
  if (voucher.status !== 'issued') return { ok: false, code: 'NOT_ISSUED' }
  if (voucher.expires_at) {
    const expiry = new Date(voucher.expires_at).getTime()
    if (!Number.isNaN(expiry) && expiry <= now.getTime()) return { ok: false, code: 'EXPIRED' }
  }
  if (voucher.gift_claim_token_hash && !voucher.gift_claimed_at) {
    return { ok: false, code: 'PENDING_GIFT' }
  }
  return { ok: true }
}

/**
 * The form. Same limits as the checkout gift fields (`giftSchema` in
 * lib/validations/checkout.ts): the email is the address the link goes to and
 * is the only required field; the greeting is capped where the mail template
 * stops reading.
 */
export const giftTransferSchema = z.object({
  recipientEmail: z
    .string()
    .trim()
    .min(1, 'צריך את המייל של המקבל')
    .max(254)
    .email('כתובת המייל אינה תקינה'),
  recipientName: z.string().trim().max(80, 'השם ארוך מדי').optional(),
  message: z.string().trim().max(500, 'הברכה ארוכה מדי').optional(),
})

export type GiftTransferInput = z.infer<typeof giftTransferSchema>

/** UUID shape, so a bad id is refused here rather than as a Postgres 22P02. */
export function isVoucherId(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)
}
