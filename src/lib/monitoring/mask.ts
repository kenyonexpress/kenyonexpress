/**
 * Turning a user id into something a log line may carry.
 *
 * WHY THE RAW ID IS NOT ACCEPTABLE. `profiles.id` is the primary key the whole
 * database joins on and the subject of every Supabase session. A log drain is a
 * third party, its retention is not this project's to set, and "identify the
 * customer" is not a capability a log line needs -- the question a log answers
 * is "were these forty lines the same person", not "who".
 *
 * WHY NOT A PREFIX OF THE UUID. It reads like masking and is not: the first
 * eight characters are enough to find the row with `LIKE '3f2a1b7c%'`, so the
 * drain still holds a working handle to the account.
 *
 * WHY NOT SHA-256. `node:crypto` is a Node built-in and this is read from
 * `log.ts`, which the edge runtime and the client bundler both walk (see
 * observability/request-context.ts for the build error that establishes this).
 * `crypto.subtle.digest` exists in every runtime but is ASYNC, and a logger
 * that awaits is a logger that cannot be called from a synchronous branch --
 * which is most of them.
 *
 * WHAT THIS IS INSTEAD, STATED HONESTLY. FNV-1a over the id, 64 bits, hex. It
 * is a pseudonym, not a cipher: it is stable, so two lines an hour apart can be
 * recognised as one person, and it is not a credential of any kind. It is safe
 * HERE specifically because the input is a random 122-bit UUID -- there is no
 * dictionary of user ids to run through the function, which is exactly what
 * makes hashing an email or a phone number worthless.
 */

/** FNV-1a, 64-bit, in BigInt because 64 bits does not fit a JS number. */
const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const MASK_64 = 0xffffffffffffffffn

/**
 * A stable pseudonym for one user, or null.
 *
 * Null in, null out, and an empty string counts as null: an anonymous request
 * must log `user_id: null` rather than a hash of nothing, which would make
 * every logged-out visitor look like the same person.
 */
export function maskUserId(userId: string | null | undefined): string | null {
  if (!userId) return null

  let hash = FNV_OFFSET
  for (let index = 0; index < userId.length; index++) {
    hash ^= BigInt(userId.charCodeAt(index))
    hash = (hash * FNV_PRIME) & MASK_64
  }

  // The prefix is not decoration. It is what stops the value being pasted into
  // a `where id =` by someone who assumed a hex string was the id.
  return `u_${hash.toString(16).padStart(16, '0')}`
}
