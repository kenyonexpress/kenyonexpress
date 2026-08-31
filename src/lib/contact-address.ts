/**
 * The business's own contact address, in ONE place.
 *
 * It was in three: `LegalContactBlock.tsx` exported it as a literal, and
 * `server/actions/contact.ts` and `lib/email/admin-alerts.ts` each wrote
 * `process.env.CONTACT_TO ?? 'info@kenyonexpress.co.il'` separately. Three
 * copies of one address, two of them behind an env var and one of them not,
 * which means setting `CONTACT_TO` moved the mail and left the four legal
 * documents still printing the old address to the reader. A privacy notice
 * that names an address nobody reads is not a cosmetic defect: under the
 * Protection of Privacy Law it is the address a data-subject request is sent to.
 *
 * The default is kept rather than removed. An unset variable must not produce
 * an empty `To:` on the contact form or a blank line in a legal document, and
 * `info@` at the company's own domain is the address the live site already
 * publishes, so it is a real fallback and not a placeholder.
 */

/** The address used when `CONTACT_TO` is not set. */
export const DEFAULT_CONTACT_EMAIL = 'info@kenyonexpress.co.il'

/**
 * Where operator mail goes and what the legal pages print.
 *
 * Takes `env` so it is testable without mutating `process.env`, matching the
 * shape `adminAlertRecipient` already used.
 */
export function contactEmail(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CONTACT_TO?.trim()
  return configured && configured.length > 0 ? configured : DEFAULT_CONTACT_EMAIL
}
