import { type Agorot, agorot } from '@/lib/money'

/**
 * The referral programme's terms as STEP 13 and STEP 46 name them, mirrored
 * for display.
 *
 * THE DATABASE DECIDES. The live terms are one row of
 * `referral_program_settings` (098), read by `getReferralProgram()`, and
 * `fn_complete_referral` pays whatever that row says at completion time.
 * Migration 250 seeds the row with these numbers. This module exists so a
 * page can say "₪20 per friend" before the row is read, and so
 * `terms.test.ts` can fail when the seed and the copy drift apart. It never
 * moves money.
 */

/** What the referrer is credited per successful referral: ₪20, integer agorot. */
export const REFERRAL_CASHBACK_AGOROT: Agorot = agorot(2000)

/**
 * What the referred friend is credited on their first qualifying order: ₪10,
 * integer agorot (STEP 46, "bonus cashback both sides"). Equal to the wallet's
 * minimum redemption (`MIN_WALLET_REDEMPTION_ILS`), so the bonus is spendable
 * on its own and not a balance that sits below the floor until a second one
 * arrives. Paid in the same `fn_pay_referral` call as the referrer's side.
 */
export const REFERRED_CASHBACK_AGOROT: Agorot = agorot(1000)

/**
 * The wallet ledger reason `fn_pay_referral` writes (098). The transfer
 * is FROM `platform:cashback_reserve`, which is what makes the bonus cashback:
 * `fn_cashback_expire` (215) sweeps every credit from that account after
 * twelve months, keyed on the account and not on this string.
 */
export const REFERRAL_WALLET_REASON = 'referral_bonus'
