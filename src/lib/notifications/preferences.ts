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
): { kind: OptionalKind; channels: Record<Channel, boolean> }[] {
  return OPTIONAL_KINDS.map((kind) => ({
    kind,
    channels: Object.fromEntries(
      CHANNELS.map((channel) => [channel, mayNotify(kind, channel, rows)]),
    ) as Record<Channel, boolean>,
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
