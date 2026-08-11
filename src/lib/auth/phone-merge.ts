/**
 * Deciding whether a phone number may be attached to an account that already
 * exists.
 *
 * THE PROBLEM. Customers signed up with email and typed a phone number into the
 * signup form; it landed in `profiles.phone` and never in `auth.users.phone`.
 * Supabase matches a phone OTP against `auth.users.phone` only. So without this,
 * the day phone sign-in is switched on, every one of those customers gets a
 * BRAND NEW empty account: no orders, no coupons, no wallet - while their real
 * account still exists and they cannot see why.
 *
 * THE FIX, AND ITS ORDER. Before the SMS is sent, the phone is attached to the
 * matching existing account. Then `signInWithOtp` finds it and signs them into
 * the account they already had. The attach happens BEFORE possession is proved,
 * and that is safe because the attach grants nothing on its own: the code still
 * goes to the real handset, and only entering it produces a session. What the
 * attach does is decide WHICH account a successful code opens.
 *
 * WHERE IT REFUSES, AND WHY EACH REFUSAL EXISTS:
 *
 *  - MORE THAN ONE profile carries the number. Then the number does not
 *    identify a person and picking one is a coin toss for somebody's order
 *    history. Data entry produces this: a family sharing a number, a typo.
 *
 *  - The matching account ALREADY has a different phone on `auth.users`. That
 *    is a deliberate, verified attachment made through the account page, and
 *    silently replacing it would let anyone who knows an old number in the
 *    profile table take the account.
 *
 *  - The number is already attached to SOME account. Nothing to do; Supabase
 *    will route the OTP correctly on its own.
 *
 * WHAT IT CANNOT PROTECT AGAINST, SAID PLAINLY: Israeli mobile numbers are
 * recycled. Whoever holds the number today receives the code, and if a previous
 * owner's profile carries it they reach that account. This is inherent to phone
 * authentication rather than to this function, and it is the reason the phone
 * is never a route to changing a password or an email.
 */

export type ProfileRow = {
  id: string
  phone: string | null
  email: string | null
}

export type AuthUserRow = {
  id: string
  phone: string | null
}

export type MergeDecision =
  | { action: 'attach'; userId: string; reason: 'profile phone matches one account' }
  | { action: 'none'; reason: string }

/**
 * Pure, so the rule can be tested exhaustively without a database. The caller
 * supplies the candidate profiles (already filtered to the normalised number)
 * and the auth row of the single candidate, if there was one.
 */
export function decidePhoneMerge(args: {
  e164: string
  /** Profiles whose stored phone normalises to `e164`. */
  candidates: readonly ProfileRow[]
  /** The auth row for the sole candidate. Null when there is no sole candidate. */
  authUser: AuthUserRow | null
  /** True when some account already claims this number on `auth.users`. */
  alreadyAttachedToSomeone: boolean
}): MergeDecision {
  if (args.alreadyAttachedToSomeone) {
    return { action: 'none', reason: 'phone already attached to an account' }
  }

  if (args.candidates.length === 0) {
    return { action: 'none', reason: 'no existing profile carries this number' }
  }

  if (args.candidates.length > 1) {
    // A shared family number or a typo. The number stops identifying a person,
    // and guessing would hand somebody else's orders to whoever holds the SIM.
    return { action: 'none', reason: 'more than one profile carries this number' }
  }

  const candidate = args.candidates[0] as ProfileRow
  if (!args.authUser || args.authUser.id !== candidate.id) {
    return { action: 'none', reason: 'candidate account could not be read' }
  }

  if (args.authUser.phone && args.authUser.phone !== args.e164) {
    // A verified attachment made from the account page. An unverified string in
    // `profiles` must never overwrite it.
    return { action: 'none', reason: 'account already has a different verified phone' }
  }

  return { action: 'attach', userId: candidate.id, reason: 'profile phone matches one account' }
}
