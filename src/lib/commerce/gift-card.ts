import { type Agorot, agorot } from '@/lib/commerce/money'

/**
 * What a gift card is worth, judged once so the balance page, the redemption
 * action and the tests all read the same answer.
 *
 * THE MODEL, restated from migration 234: a card is redeemed IN FULL into the
 * wallet, so its balance is binary - face value while active, zero after.
 * Partial spend belongs to the wallet, which already does it at checkout.
 *
 * Expiry is a judgement over `expires_at`, not a status the database has to be
 * told about: nothing needs to run on the day a card lapses, the card just
 * starts answering 'expired'. `redeem_gift_card` makes the same comparison
 * under the row lock, so this module can never be more generous than the RPC -
 * only equally strict, earlier, and with a friendlier sentence.
 */

/**
 * Israeli consumer-protection floor for stored-value certificates (חוק הגנת
 * הצרכן, תיקון 51): five years from issuance.
 */
export const GIFT_CARD_VALIDITY_YEARS = 5

export type GiftCardState = 'active' | 'redeemed' | 'expired' | 'cancelled'

export interface GiftCardRecord {
  amount_agorot: number
  status: string
  expires_at: string | Date
}

export interface GiftCardJudgement {
  state: GiftCardState
  /** Integer agorot. Face value while active, zero in every other state. */
  balanceAgorot: Agorot
  expiresAt: Date
}

/**
 * Status wins over the clock: a card redeemed five minutes before it expired
 * is 'redeemed', not 'expired', because that is what its holder needs told.
 */
export function judgeGiftCard(card: GiftCardRecord, now: Date): GiftCardJudgement {
  const expiresAt = card.expires_at instanceof Date ? card.expires_at : new Date(card.expires_at)
  const face = agorot(Math.max(0, Math.trunc(card.amount_agorot)))

  if (card.status === 'cancelled')
    return { state: 'cancelled', balanceAgorot: agorot(0), expiresAt }
  if (card.status === 'redeemed') return { state: 'redeemed', balanceAgorot: agorot(0), expiresAt }
  if (expiresAt.getTime() <= now.getTime()) {
    return { state: 'expired', balanceAgorot: agorot(0), expiresAt }
  }
  return { state: 'active', balanceAgorot: face, expiresAt }
}

/**
 * The expiry a card is stamped with at issuance. Calendar years, not day
 * arithmetic: a card bought on 29.02 lands on 28.02, which JavaScript's
 * setFullYear does by rolling to 01.03 - one day MORE validity, never less,
 * which is the only direction the law allows an approximation to err in.
 */
export function giftCardExpiryFromIssue(issuedAt: Date): Date {
  const expires = new Date(issuedAt.getTime())
  expires.setFullYear(expires.getFullYear() + GIFT_CARD_VALIDITY_YEARS)
  return expires
}
