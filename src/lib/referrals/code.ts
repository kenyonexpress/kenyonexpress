/**
 * The referral code alphabet, and the only place a code is normalised.
 *
 * The shape is set by `fn_ensure_referral_code` in 098: eight characters over
 * Crockford base32 with I, L, O and U removed. That removal is the reason this
 * module exists rather than a bare `.toUpperCase()` at three call sites. A
 * code is dictated across a table and typed off a screenshot far more often
 * than it is clicked, so 1/l/I and 0/O are the confusions the alphabet was
 * chosen to make impossible.
 *
 * `fn_claim_referral` applies `upper(btrim(...))` itself, so normalising here
 * is not what makes the claim work. What it buys is that a code is only ever
 * WRITTEN to a cookie in one form, and that a `?ref=` full of junk from a
 * scraper never reaches the database at all.
 */

/** Crockford base32 minus I, L, O and U. Must match 098 exactly. */
export const REFERRAL_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Length minted by `fn_ensure_referral_code`. */
export const REFERRAL_CODE_LENGTH = 8

const VALID = new RegExp(`^[${REFERRAL_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`)

/**
 * A code as the database would see it, or null when it could not be one.
 *
 * Null rather than a thrown error, because every caller is on a path where a
 * bad code is an ordinary event: a mistyped link, a truncated share, a bot
 * walking `?ref=` with a payload in it. None of those should be an exception
 * on the way into the home page.
 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const code = raw.trim().toUpperCase()
  return VALID.test(code) ? code : null
}

/** The query parameter a share link carries. */
export const REFERRAL_QUERY_PARAM = 'ref'

/**
 * The link a referrer shares.
 *
 * Points at the home page and not at `/signup`, deliberately. The person
 * receiving it has been told about a shop, not about a form, and the code
 * survives the whole visit in a cookie either way, so the landing that
 * converts is the one with products on it.
 */
export function referralShareUrl(code: string, origin: string): string {
  const url = new URL('/', origin)
  url.searchParams.set(REFERRAL_QUERY_PARAM, code)
  return url.toString()
}
