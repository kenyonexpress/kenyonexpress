/**
 * Which customer emails go out without the customer asking for them.
 *
 * OWNER POLICY, 04.11.2026 (queue item S12): the purchase confirmation is the
 * only email the system sends a customer on its own. It is one mail with two
 * payload shapes, `order_paid` for an order with no coupons and
 * `voucher_issued` for an order with coupons. The triggers in 095/102 are
 * mutually exclusive, so one purchase sends one mail.
 *
 * "Automatic" means the system decided to send it: a trigger, a cron or a
 * sweep. That rules out the expiry reminder (`voucher_expiring`, a sweep), the
 * abandoned-cart nudge (a cron), the welcome mail, the shipping notice and
 * every other outbox kind. Those reach the customer as push and in-app only,
 * and the order page holds everything they would have said.
 *
 * Mail sent because a person pressed a button for it is not automatic, and it
 * is not governed here:
 *
 *   - `voucher_gifted`: the buyer typed the recipient's address and pressed
 *     send. The recipient has no account, so this mail is the delivery;
 *   - password reset, magic link, security alert and newsletter double opt-in,
 *     all sent directly from the action the person took.
 *
 * Operator mail (supplier sale alert, digest, reconciliation) goes to the
 * business, not to a customer, and is outside this policy too.
 */
export const AUTOMATIC_CUSTOMER_EMAIL_KINDS = ['order_paid', 'voucher_issued'] as const

/** Outbox kinds a customer gets by email because a person explicitly asked for it. */
export const REQUESTED_CUSTOMER_EMAIL_KINDS = ['voucher_gifted'] as const

/**
 * Outbox kinds a customer gets by email only after switching it on.
 *
 * S20 (04.11.2026): the expiry reminder goes out "push + email per
 * preference". That does not reopen S12: the sweep still never decides to
 * mail on its own. The email leg is OFF until the customer turns on the one
 * switch for it on /account/notifications, and a stored `enabled = true` row
 * is the customer asking. No row, or `false`, means no mail.
 */
export const OPT_IN_CUSTOMER_EMAIL_KINDS = ['voucher_expiring'] as const

export function isOptInCustomerEmailKind(kind: string): boolean {
  return (OPT_IN_CUSTOMER_EMAIL_KINDS as readonly string[]).includes(kind)
}

/** May the outbox mail this customer kind at all? */
export function isCustomerEmailKindAllowed(kind: string): boolean {
  return (
    (AUTOMATIC_CUSTOMER_EMAIL_KINDS as readonly string[]).includes(kind) ||
    (REQUESTED_CUSTOMER_EMAIL_KINDS as readonly string[]).includes(kind)
  )
}

/**
 * Direct-send automatic customer mail outside the outbox. Each one is a cron
 * that sends mail on its own, so under the S12 policy each one is off. The
 * route checks this before it reads anything, which stops it at the source
 * rather than per recipient.
 */
export type DirectAutomaticCustomerEmail = 'abandoned-cart'

export function isDirectAutomaticCustomerEmailAllowed(
  _mail: DirectAutomaticCustomerEmail,
): boolean {
  return false
}
