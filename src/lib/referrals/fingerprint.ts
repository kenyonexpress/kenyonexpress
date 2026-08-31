import { createHash } from 'node:crypto'

/**
 * A `referral_signals.fingerprint` value: namespaced by kind, then hashed.
 *
 * WHAT THE HASH IS FOR, AND WHAT IT IS NOT FOR
 *
 * It is not secrecy, and saying so plainly matters more than the line of code:
 * SHA-256 over an IPv4 address is a 2^32 search and reverses in seconds, and a
 * card token is only unguessable because it is already random. What actually
 * keeps these rows private is the table: 098 gives `referral_signals` RLS with
 * NO policy at all, a flat refusal to every browser role, so only the service
 * key reads it.
 *
 * What the hash does buy is worth having anyway: one fixed column width
 * whatever went in, a guarantee that two kinds can never collide because the
 * kind is inside the digest, and the fact that a future admin screen doing
 * `select fingerprint` cannot put a customer's raw IP or a live card token on a
 * page. The comparison the fraud guard makes is equality, and equality survives
 * hashing.
 */
export type SignalKind = 'device' | 'ip' | 'card'

export function referralFingerprint(kind: SignalKind, value: string): string {
  return createHash('sha256').update(`${kind}:${value}`).digest('hex')
}
