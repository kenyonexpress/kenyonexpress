/**
 * Guest checkout identity (S07).
 *
 * Orders, addresses and saved-card tokens are all keyed to `auth.users.id`, and
 * `orders.user_id` is NOT NULL on production. Rather than loosen that, a
 * shopper who is not signed in is given an anonymous Supabase session at the
 * moment they press pay. The order, the address and the Cardcom token then
 * belong to that user id, and the Google sign-in offered AFTER payment links
 * the identity onto the SAME user (`linkIdentity`), so nothing has to move.
 *
 * Needs "anonymous sign-ins" and "manual linking" on the project. Both were
 * measured on (management API, 04.11.2026). When anonymous sign-in fails,
 * `ensureCheckoutUser` answers `GUEST_UNAVAILABLE` and the form says so.
 */

export type CheckoutIdentityUser = { id: string; is_anonymous?: boolean; email?: string }

export type CheckoutIdentityClient = {
  auth: {
    getUser(): Promise<{ data: { user: CheckoutIdentityUser | null } }>
    signInAnonymously(): Promise<{
      data: { user: CheckoutIdentityUser | null }
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
  /** Asked only before a NEW anonymous user is minted: the per-IP ceiling. */
  mayCreate: () => Promise<boolean> = async () => true,
): Promise<CheckoutIdentity> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    return { ok: true, userId: user.id, guest: user.is_anonymous === true, created: false }
  }

  if (!(await mayCreate())) {
    return {
      ok: false,
      code: 'GUEST_UNAVAILABLE',
      message: 'יותר מדי ניסיונות תשלום, המתינו מעט ונסו שוב',
    }
  }

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error || !data.user) {
    return {
      ok: false,
      code: 'GUEST_UNAVAILABLE',
      message: 'לא ניתן להמשיך כאורח כרגע, נסו שוב או התחברו',
    }
  }

  // Once a user exists the cart is read by profile, so a cart left on the
  // cookie would look empty to the very next read. Refuse to go on if it did
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

/** Plain check, shared by the server action and the form: one address, no spaces. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normaliseGuestEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  if (value.length > 254 || !EMAIL_RE.test(value)) return null
  return value
}
