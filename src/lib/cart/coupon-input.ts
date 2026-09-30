import { normalizeCouponCode } from '@/lib/cart/coupon'
import { UNIT_CODE_LENGTH, isUnitCodeShaped, isValidUnitCode } from '@/lib/coupons/unit-codes'

/**
 * What the cart's coupon field checks BEFORE the server is asked.
 *
 * Every code the cart accepts is either a campaign word (letters and digits,
 * typed from a banner) or a printed 8-digit unit code with a Luhn check digit
 * (182, `lib/coupons/unit-codes.ts`). A run of digits is therefore always a
 * unit code, and a unit code that is not 8 digits, or whose check digit does
 * not agree with the other seven, can never resolve: the server's own
 * `isValidUnitCode` gate refuses it before any lookup. Refusing it here first
 * saves the round trip and, more to the point, tells the shopper WHAT is wrong
 * ("7 digits, not 8"; "one digit is mistyped") instead of the server's flat
 * "not found".
 *
 * The check is deliberately narrow. A code with any letter in it is passed
 * through untouched, because campaign codes have no shape this module knows.
 * Nothing here decides whether a code is WORTH anything; that is the server's
 * question and stays there.
 *
 * `MAX_COUPON_CODE_LENGTH` mirrors the ceiling in `runApplyCouponCode`.
 */

export const MAX_COUPON_CODE_LENGTH = 64

export type CouponInputCheck =
  | { ok: true; code: string }
  | { ok: false; reason: CouponInputRefusal; message: string }

export type CouponInputRefusal = 'empty' | 'too-long' | 'digits-not-eight' | 'check-digit'

const MESSAGES: Record<CouponInputRefusal, string> = {
  empty: 'יש להזין קוד קופון',
  'too-long': 'קוד הקופון ארוך מדי',
  'digits-not-eight': `קוד מספרי חייב להכיל ${UNIT_CODE_LENGTH} ספרות בדיוק`,
  'check-digit': 'הקוד לא תקין, בדקו שכל הספרות הוקלדו נכון',
}

function refuse(reason: CouponInputRefusal): CouponInputCheck {
  return { ok: false, reason, message: MESSAGES[reason] }
}

/** True when the normalised code is digits only, i.e. must be a unit code. */
export function isNumericCouponCode(code: string): boolean {
  return /^[0-9]+$/.test(code)
}

/**
 * The normalised code, or the first reason it cannot be sent.
 *
 * Normalisation is the server's own (`normalizeCouponCode`): spaces dropped,
 * case folded. A shopper who types "1234 5678" off a printed card gets the
 * 8-digit check, not a length refusal for the space.
 */
export function checkCouponInput(raw: string): CouponInputCheck {
  const code = normalizeCouponCode(raw)
  if (code === '') return refuse('empty')
  if (code.length > MAX_COUPON_CODE_LENGTH) return refuse('too-long')
  if (isNumericCouponCode(code)) {
    if (!isUnitCodeShaped(code)) return refuse('digits-not-eight')
    if (!isValidUnitCode(code)) return refuse('check-digit')
  }
  return { ok: true, code }
}
