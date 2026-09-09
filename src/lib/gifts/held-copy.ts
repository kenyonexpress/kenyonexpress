import { formatCouponDate } from '@/lib/vouchers/coupon-view'

/**
 * What the buyer of a gift is told in place of the code.
 *
 * ONE FUNCTION, because three surfaces show this - the coupon list, the coupon
 * page and the confirmation page - and the sentence they show is a promise
 * about when an email goes out. Three copies of it are three chances for one of
 * them to keep saying "נשלח" after the schedule made that false.
 *
 * Plain strings and no JSX: the callers style it very differently (a row of
 * meta text, a card body, a confirmation block) and the only thing they need to
 * share is the wording.
 */

export interface GiftHeldCopy {
  /** Short label for a chip or a row. */
  badge: string
  /** The one sentence that says what happened and to whom. */
  headline: string
  /** Why there is no code on screen. Always the same, and always shown. */
  explanation: string
}

export function giftHeldCopy(gift: {
  recipientName: string | null
  recipientEmail: string | null
  deliverAt: string | null
  queuedAt: string | null
}): GiftHeldCopy {
  const who = gift.recipientName?.trim() || gift.recipientEmail?.trim() || 'המקבל'

  // A date in the future is the only case that is not "already on its way".
  // `queuedAt` alone does not mean delivered: with 226 the outbox row can be
  // parked for weeks, so the schedule is what decides the tense.
  const scheduled =
    gift.deliverAt && new Date(gift.deliverAt).getTime() > Date.now() ? gift.deliverAt : null

  const headline = scheduled
    ? `הקופון יישלח אל ${who} בתאריך ${formatCouponDate(scheduled)}`
    : gift.queuedAt
      ? `הקופון נשלח אל ${who}`
      : `הקופון מיועד אל ${who}`

  return {
    badge: scheduled ? 'מתנה מתוזמנת' : 'מתנה',
    headline,
    /**
     * The reason is stated rather than left to be inferred. A customer who
     * bought a coupon and sees no code on it concludes the site is broken; a
     * customer who is told the code is with the person they sent it to
     * concludes the site worked.
     */
    explanation:
      'הקוד וה-QR מוצגים למקבל בלבד, אחרי שהוא אוסף את המתנה. עד אז הקופון נשאר בחשבון שלכם וניתן לבטל את ההזמנה.',
  }
}
