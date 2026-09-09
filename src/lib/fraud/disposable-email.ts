/**
 * Disposable and aliased email addresses.
 *
 * WHAT A BLOCKLIST IS AND IS NOT. There are thousands of throwaway-inbox
 * providers and new ones appear faster than any list is updated, so the list
 * below is a FLOOR, not a wall: it stops the lazy version of the attack (one
 * person minting accounts to spend a first-order coupon a dozen times) and it
 * does not stop anybody who reads it. That is worth saying out loud, because a
 * blocklist is exactly the kind of control that gets written down as "handled".
 *
 * THE SECOND FUNCTION IS THE MORE USEFUL ONE. `canonicalEmail` does not judge
 * anything; it answers "are these two addresses the same inbox". Gmail ignores
 * dots and everything after a `+`, so `a.b+1@gmail.com`, `ab+2@gmail.com` and
 * `ab@gmail.com` all deliver to one person, and a first-order discount keyed on
 * the address as typed can be claimed by that person indefinitely without ever
 * touching a disposable provider. Plus-addressing is honoured the same way by
 * Outlook, Fastmail, Proton and most modern hosts; dot-folding is Gmail-only,
 * so it is applied only there.
 *
 * NOT USED TO REFUSE A LOGIN. An address already in the database keeps working
 * whatever this file says: someone who signed up through a domain that later
 * lands on the list is a customer, and locking them out of an account holding
 * their vouchers to enforce a signup rule is a worse outcome than the abuse.
 * The checks here run on CREATION paths only.
 */

/**
 * Known throwaway-inbox domains. Kept in code rather than in a table on
 * purpose: a table is only editable by an operator with a console and a
 * migration applied, and neither exists here yet (`migrations/pending/`). A
 * constant ships with the deploy that needs it, is diffable, and is covered by
 * the test beside this file. The day an operator needs to add a domain without
 * a deploy, this becomes a table seeded from this array.
 */
const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  '0-mail.com',
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  'anonbox.net',
  'byom.de',
  'dispostable.com',
  'e4ward.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'harakirimail.com',
  'inboxbear.com',
  'jetable.org',
  'mail-temporaire.fr',
  'mail7.io',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mailsac.com',
  'mintemail.com',
  'mohmal.com',
  'moakt.com',
  'mytemp.email',
  'nowmymail.com',
  'pokemail.net',
  'sharklasers.com',
  'spam4.me',
  'spambog.com',
  'spamgourmet.com',
  'temp-mail.io',
  'temp-mail.org',
  'tempail.com',
  'tempinbox.com',
  'tempmail.dev',
  'tempmail.net',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.de',
  'trashmail.me',
  'trashmail.net',
  'tmpmail.net',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
])

/** Hosts that fold `.` out of the local part. Gmail, and only Gmail. */
const DOT_FOLDING_DOMAINS: ReadonlySet<string> = new Set(['gmail.com', 'googlemail.com'])

/**
 * The domain, lowercased, or `null` when the input is not shaped like an
 * address. Deliberately not a validator: `z.string().email()` already ran at
 * every call site, and re-deciding validity here would give two answers to one
 * question.
 */
export function emailDomain(raw: string): string | null {
  const at = raw.trim().toLowerCase().lastIndexOf('@')
  if (at <= 0) return null
  const domain = raw
    .trim()
    .toLowerCase()
    .slice(at + 1)
  return domain.length > 0 && domain.includes('.') ? domain : null
}

/** True when the address's domain is a known throwaway provider. */
export function isDisposableEmail(raw: string): boolean {
  const domain = emailDomain(raw)
  if (!domain) return false
  if (DISPOSABLE_DOMAINS.has(domain)) return true
  // `sub.mailinator.com` and friends: providers hand out subdomains freely, so
  // a suffix match is what actually covers the product rather than one host.
  for (const blocked of DISPOSABLE_DOMAINS) {
    if (domain.endsWith(`.${blocked}`)) return true
  }
  return false
}

/**
 * The address reduced to the inbox it actually reaches, for comparing two
 * addresses. NOT for storing in place of what the customer typed: mail is sent
 * to the address as given, and Gmail's dot-folding is a property of Gmail, not
 * a licence to rewrite anyone's address in our database.
 */
export function canonicalEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0) return trimmed
  const domain = trimmed.slice(at + 1)
  let local = trimmed.slice(0, at)

  const plus = local.indexOf('+')
  if (plus > 0) local = local.slice(0, plus)
  if (DOT_FOLDING_DOMAINS.has(domain)) local = local.replaceAll('.', '')

  // A local part that was entirely a tag (`+tag@gmail.com`) is not an inbox we
  // can name; hand back the original rather than an empty local part.
  return local.length > 0 ? `${local}@${domain}` : trimmed
}

/** True when both addresses deliver to the same inbox. */
export function sameInbox(a: string, b: string): boolean {
  return canonicalEmail(a) === canonicalEmail(b)
}

/** Exposed for the inventory test and for the docs table in `docs/FRAUD.md`. */
export const DISPOSABLE_DOMAIN_COUNT = DISPOSABLE_DOMAINS.size
