/**
 * Which notifications a customer may switch off, and which they may not.
 *
 * THE DISTINCTION THIS FILE EXISTS FOR
 *
 * A preference table with one row per kind per channel invites exactly one
 * mistake: letting a customer switch off the mail that carries the coupon they
 * just paid for. The support ticket that follows is "I bought it and nothing
 * arrived", and the answer is a setting they turned off six weeks earlier and
 * do not remember.
 *
 * So `REQUIRED` is checked BEFORE the table, and the table is never consulted
 * for those kinds. It is not that the row is ignored -- there is no row, the UI
 * does not offer a switch, and the resolver returns `true` without a read.
 *
 * WHAT MAKES A KIND REQUIRED
 *
 * Not "important". Whether the message is the thing the customer BOUGHT, or is
 * the record of money moving. A voucher email IS the product. A receipt is
 * evidence. A refund confirmation is the only proof the money came back. None
 * of those is a message about the shop; they are the shop delivering.
 *
 * A reminder that a voucher expires in seven days, by contrast, is a service
 * the customer can decline. So is a cashback credit notice. Those are the ones
 * the table governs.
 *
 * OPERATOR ALERTS ARE NOT IN EITHER LIST. `invoice_dead`, `low_stock` and
 * `reconciliation_gap` go to a fixed operator address, not to a user, and a
 * per-user preference for them would be a row nobody owns. They are refused by
 * `isPreferenceKind` rather than silently defaulting to enabled, because a
 * setting that appears to exist and governs nothing is worse than no setting.
 */

export const CHANNELS = ['email', 'push', 'whatsapp', 'in_app'] as const
export type Channel = (typeof CHANNELS)[number]

/**
 * The channels the settings page renders a switch for.
 *
 * `email` is deliberately absent. Every kind in `OPTIONAL_KINDS` is a
 * customer-facing kind, and the owner's 22.09.2026 policy makes `mayNotify`
 * return `false` for the email channel on every one of them unconditionally
 * -- so a stored preference row for `{kind, 'email', true}` would change
 * nothing, and a switch that looks live but does nothing is exactly the
 * broken-control problem this file's own header already names for required
 * kinds. Leaving `email` out of the table is the same fix as leaving required
 * kinds out of it: there is no row, so there is nothing to lie about.
 */
export const CUSTOMER_TOGGLE_CHANNELS = CHANNELS.filter(
  (c): c is Exclude<Channel, 'email'> => c !== 'email',
)

/**
 * Owner policy, 22.09.2026: no customer email except password reset (which is
 * Supabase Auth's own outgoing mail, entirely outside `notification_outbox`
 * and this file) and voucher gifts. Everything else a customer would have
 * read in a mail now lives at /account: orders, voucher codes with QR,
 * status, invoice download.
 *
 * `voucher_gifted` IS THE ONE EXEMPTION, AND IT IS NOT AN OVERSIGHT. Every
 * other kind here restates something the ACCOUNT HOLDER can already see by
 * signing in. A gift recipient has no account until they follow this mail's
 * claim link -- there is no /account for them to check instead, so this mail
 * is the entire delivery mechanism for the gift feature, not a duplicate of
 * one. Suppressing it would not move the notice to the account area; it
 * would delete the only way a recipient ever learns they received anything.
 *
 * CHECKED IN `mayNotify` BEFORE `REQUIRED_KINDS`, deliberately: a required
 * kind is "the customer may not opt out of this on their own", which is a
 * different question from "does this channel exist for customers at all".
 * The owner policy answers the second question and answers it first.
 */
export const EMAIL_POLICY_EXEMPT_KINDS = ['voucher_gifted'] as const

/**
 * Kinds addressed to the business, not to a customer -- unaffected by the
 * no-customer-email policy above. Supplier mail is a business-to-business
 * relationship the owner's directive does not mention, and every other name
 * here already carries "operator alert, not a customer message" in its own
 * builder in `lib/email/notifications.ts`.
 */
export const OPERATOR_EMAIL_KINDS = [
  'supplier_sale',
  'payout_statement_ready',
  'invoice_dead',
  'low_stock',
  'reconciliation_gap',
  'settlement_gap',
] as const

export function isOperatorEmailKind(kind: string): boolean {
  return (OPERATOR_EMAIL_KINDS as readonly string[]).includes(kind)
}

/**
 * Kinds a customer cannot switch off, in any channel.
 *
 * Deliberately short. Every entry is either the product itself or the record of
 * money moving, and anything that is merely useful belongs in `OPTIONAL`.
 */
export const REQUIRED_KINDS = [
  /** The receipt for a purchase. */
  'order_paid',
  /** The coupon itself. Switching this off is switching off the thing bought. */
  'voucher_issued',
  /** A gift the RECIPIENT did not ask for and cannot have a preference about. */
  'voucher_gifted',
  /** The only proof the money came back. */
  'refund_completed',
] as const

/**
 * Kinds a customer may switch off, per channel.
 *
 * `order_shipped` is here and it is the closest call on the list. It is not the
 * product and not money; it is a service update about a parcel that is coming
 * either way, and a customer who has told us not to mail about deliveries is
 * making a reasonable request. It stays on by default.
 */
export const OPTIONAL_KINDS = [
  'order_shipped',
  'voucher_expiring',
  'voucher_redeemed',
  'cashback_credited',
  'welcome',
] as const

export type RequiredKind = (typeof REQUIRED_KINDS)[number]
export type OptionalKind = (typeof OPTIONAL_KINDS)[number]
export type PreferenceKind = RequiredKind | OptionalKind

export function isRequiredKind(kind: string): kind is RequiredKind {
  return (REQUIRED_KINDS as readonly string[]).includes(kind)
}

export function isOptionalKind(kind: string): kind is OptionalKind {
  return (OPTIONAL_KINDS as readonly string[]).includes(kind)
}

/** A kind a customer could have an opinion about. Operator alerts are not. */
export function isPreferenceKind(kind: string): kind is PreferenceKind {
  return isRequiredKind(kind) || isOptionalKind(kind)
}

/** One stored row. Absent means "not decided", which is not the same as false. */
export interface PreferenceRow {
  kind: string
  channel: Channel
  enabled: boolean
}

/**
 * May this notification be sent on this channel?
 *
 * DEFAULT ON, and the reason is the direction of the mistake. A missing row
 * means the customer has never opened the settings page, and treating silence
 * as "do not contact me" would stop the expiry reminder for every customer who
 * has never had an opinion -- which is all of them today, since the table is
 * empty. Opt-out is also what Israeli law requires for transactional mail and
 * permits for the rest, given the unsubscribe link every mail already carries.
 *
 * An operator kind returns `true` and never consults the table: those messages
 * are not addressed to a user.
 */
export function mayNotify(kind: string, channel: Channel, rows: readonly PreferenceRow[]): boolean {
  // Owner policy, checked first and unconditionally: the email channel does
  // not exist for a customer kind at all, so there is no preference row left
  // to consult. See EMAIL_POLICY_EXEMPT_KINDS above for the one exception.
  if (
    channel === 'email' &&
    !isOperatorEmailKind(kind) &&
    !(EMAIL_POLICY_EXEMPT_KINDS as readonly string[]).includes(kind)
  ) {
    return false
  }

  // Checked first, so a stray row for a required kind -- written by a bug, a
  // migration, or somebody with SQL access -- cannot stop a receipt.
  if (isRequiredKind(kind)) return true
  if (!isOptionalKind(kind)) return true

  const row = rows.find((r) => r.kind === kind && r.channel === channel)
  return row ? row.enabled : true
}

/**
 * The rows a settings page should render, in a fixed order.
 *
 * Required kinds are NOT included. A greyed-out switch labelled "cannot be
 * turned off" reads as a switch that is broken, and it invites the support
 * conversation the whole design avoids. What the page says instead is a
 * sentence: these are the messages you can turn off, and everything else is
 * part of what you bought.
 */
export function preferenceMatrix(
  rows: readonly PreferenceRow[],
): { kind: OptionalKind; channels: Record<Exclude<Channel, 'email'>, boolean> }[] {
  return OPTIONAL_KINDS.map((kind) => ({
    kind,
    channels: Object.fromEntries(
      CUSTOMER_TOGGLE_CHANNELS.map((channel) => [channel, mayNotify(kind, channel, rows)]),
    ) as Record<Exclude<Channel, 'email'>, boolean>,
  }))
}

/** Hebrew labels for the settings page. */
export const KIND_LABEL_HE: Record<OptionalKind, string> = {
  order_shipped: 'ההזמנה נשלחה',
  voucher_expiring: 'שובר עומד לפוג',
  voucher_redeemed: 'שובר מומש',
  cashback_credited: 'זיכוי לארנק',
  welcome: 'ברוכים הבאים',
}

export const CHANNEL_LABEL_HE: Record<Channel, string> = {
  email: 'מייל',
  push: 'התראת דחיפה',
  whatsapp: 'וואטסאפ',
  in_app: 'באתר',
}
