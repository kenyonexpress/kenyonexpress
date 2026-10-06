/**
 * A gift the recipient has already collected, seen from the buyer's order.
 *
 * `isGiftedAway` (server/payments/voucher-email.ts) is true only while a claim
 * link is OUT: token hash present, `gift_claimed_at` null. The moment the
 * recipient claims, `claimGiftedVoucher` sets `gift_claimed_at` and moves
 * `vouchers.user_id` to them - and `isGiftedAway` turns false again. On the
 * order page that read as "an ordinary coupon": the buyer saw the code and the
 * QR of a coupon that now belonged to somebody else, and the transfer buttons
 * beside it led to a 404, because the RLS-scoped read no longer found it.
 * Measured on 2026-10-05 against the E2E customer's orders (W15).
 *
 * The rule is OWNERSHIP, not the claim timestamp alone: the voucher left the
 * account when its `user_id` stopped being the buyer's. The timestamp is kept
 * as a second condition so a row whose `user_id` differs for any other reason
 * (none exists today) is not labelled a collected gift.
 */
export function giftWasCollected(
  row: { user_id: string | null | undefined; gift_claimed_at: string | null | undefined },
  ownerId: string,
): boolean {
  return Boolean(row.gift_claimed_at) && row.user_id !== ownerId
}

export interface GiftCollectedState {
  recipientName: string | null
  recipientEmail: string | null
  claimedAt: string
}
