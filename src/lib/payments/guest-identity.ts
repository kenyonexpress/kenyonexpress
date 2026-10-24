/**
 * Guest-first checkout identity.
 *
 * Orders, addresses and saved-card tokens are all keyed to `auth.users.id`
 * (`orders.user_id` is NOT NULL). Rather than loosen that, a shopper who is not
 * signed in is given an anonymous Supabase session at the moment they pay. The
 * order, the address and the Cardcom token then belong to that user id, and
 * signing in with Google AFTER payment links the identity onto the SAME user
 * (`linkIdentity`) so nothing has to be moved.
 *
 * Requires "Allow anonymous sign-ins" and "Manual linking" on the Supabase
 * project (supabase/config.toml: enable_anonymous_sign_ins, enable_manual_linking).
 * When anonymous sign-ins are off, `ensureCheckoutUser` answers
 * `GUEST_UNAVAILABLE` and the caller falls back to the old Google-first path.
 */

export type CheckoutIdentityClient = {
  auth: {
    getUser(): Promise<{ data: { user: { id: string; is_anonymous?: boolean } | null } }>
    signInAnonymously(): Promise<{
      data: { user: { id: string; is_anonymous?: boolean } | null }
      error: { message: string } | null
    }>
  }
}

export type CheckoutIdentity =
  | { ok: true; userId: string; guest: boolean; created: boolean }
  | { ok: false; code: 'GUEST_UNAVAILABLE'; message: string }

export async function ensureCheckoutUser(
  supabase: CheckoutIdentityClient,
  /** Moves the cookie cart onto the new user. Returns false when it could not. */
  mergeGuestCart: (userId: string) => Promise<boolean>,
): Promise<CheckoutIdentity> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    return { ok: true, userId: user.id, guest: user.is_anonymous === true, created: false }
  }

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error || !data.user) {
    return {
      ok: false,
      code: 'GUEST_UNAVAILABLE',
      message: 'לא ניתן להמשיך כאורח כרגע, יש להתחבר כדי לשלם',
    }
  }

  // The cart is read by profile once a user exists, so a cart that stays on the
  // cookie would look empty to the very next call. Refuse to go on if it did
  // not move: charging for an empty cart is worse than asking to retry.
  const merged = await mergeGuestCart(data.user.id)
  if (!merged) {
    return {
      ok: false,
      code: 'GUEST_UNAVAILABLE',
      message: 'לא הצלחנו להעביר את העגלה, נסו שוב',
    }
  }
  return { ok: true, userId: data.user.id, guest: true, created: true }
}
