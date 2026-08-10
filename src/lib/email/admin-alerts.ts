/**
 * Operator alerts, carried by the same outbox as everything else.
 *
 * WHY NOT A LOG LINE. A tax document that has failed five times is a legal
 * obligation the platform is not meeting, and `log.error` is a thing nobody
 * reads until they already know to look. The row in `notification_outbox`
 * survives a deploy, retries on its own, and shows up in the same place the
 * customer's mail does.
 *
 * WHY IT DOES NOT PUSH. `lib/push/templates.ts` returns null for these kinds,
 * so they settle as `push_status = 'none'`. An operator alert on a customer's
 * lock screen is exactly the leak that gate exists to prevent.
 */

/** Where operator mail goes. Same variable the contact form already uses. */
export function adminAlertRecipient(env: NodeJS.ProcessEnv = process.env): string {
  return (env.CONTACT_TO ?? 'info@kenyonexpress.co.il').trim()
}

export type AdminAlertKind = 'invoice_dead' | 'low_stock' | 'reconciliation_gap'

/**
 * The dedupe key an alert is queued under.
 *
 * Keyed by the THING that is wrong, not by the moment it was noticed. The
 * invoice cron runs every ten minutes and will keep finding the same dead row;
 * a time-based key would mail an operator every ten minutes about one problem,
 * which is how alerting stops being read.
 *
 * `low_stock` deliberately puts the DATE into `subjectId`, and that is not a
 * contradiction. A dead invoice is one event and is worth saying once ever; a
 * product sitting under its threshold is an ongoing situation and is worth
 * saying once a day until somebody restocks it.
 */
export function adminAlertDedupeKey(kind: AdminAlertKind, subjectId: string): string {
  return `admin:${kind}:${subjectId}`
}
