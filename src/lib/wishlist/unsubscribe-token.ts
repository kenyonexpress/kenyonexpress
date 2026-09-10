import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The signed unsubscribe link for wishlist alert mail.
 *
 * STATELESS ON PURPOSE, unlike the newsletter's stored `unsubscribe_token`.
 * An alert mail is composed by a cron over hundreds of users; minting and
 * persisting a random token per recipient per send would add a write per email
 * whose only job is to be compared once. An HMAC over what the link has to say
 * (who, which alerts, until when) carries the same authority with no storage:
 * the signature can only have come from someone holding the server secret, so
 * presenting it IS the authorisation, the same reasoning as
 * `gifts/claim-token.ts`.
 *
 * THE KEY IS DERIVED, NOT BORROWED. `WISHLIST_UNSUB_SECRET` when set;
 * otherwise HMAC(CRON_SECRET, "wishlist-unsubscribe-v1"), so a correctly
 * provisioned production (CRON_SECRET is required there) signs working links
 * without a new variable, while the derivation means a captured unsubscribe
 * token says nothing about CRON_SECRET itself and the two can rotate apart
 * later. No secret at all means no signer, and the caller must not send mail
 * that would carry a dead link.
 *
 * EXPIRY IS LONG (180 days) because an unsubscribe link lives in an inbox and
 * has to work when the reader finally gets around to it. What it protects is
 * narrow: the worst a leaked token allows is turning somebody's alerts OFF.
 */

export type UnsubscribeScope = 'alerts' | 'digest' | 'all'

const SCOPES: readonly UnsubscribeScope[] = ['alerts', 'digest', 'all']

export const UNSUBSCRIBE_TOKEN_TTL_DAYS = 180

function signingKey(): Buffer | null {
  const dedicated = process.env.WISHLIST_UNSUB_SECRET
  if (dedicated && dedicated.length >= 20) {
    return createHmac('sha256', dedicated).update('wishlist-unsubscribe-v1').digest()
  }
  const cron = process.env.CRON_SECRET
  if (cron && cron.length > 0) {
    return createHmac('sha256', cron).update('wishlist-unsubscribe-v1').digest()
  }
  return null
}

/** Whether a token could be signed at all in this environment. */
export function canSignUnsubscribeTokens(): boolean {
  return signingKey() !== null
}

function sign(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload, 'utf8').digest('base64url')
}

/**
 * `<user id>.<scope>.<expiry epoch seconds>.<signature>`. The three signed
 * fields ride in the clear: nothing here is secret, and a link a person can
 * read is a link a person can trust.
 */
export function createUnsubscribeToken(
  userId: string,
  scope: UnsubscribeScope,
  now: Date = new Date(),
): string | null {
  const key = signingKey()
  if (!key) return null
  const exp = Math.floor(now.getTime() / 1000) + UNSUBSCRIBE_TOKEN_TTL_DAYS * 24 * 3600
  const payload = `${userId}.${scope}.${exp}`
  return `${payload}.${sign(key, payload)}`
}

export interface VerifiedUnsubscribe {
  userId: string
  scope: UnsubscribeScope
}

/**
 * Rejects before it computes: a malformed token costs a regex, not an HMAC,
 * because the token arrives in a URL anyone can type.
 */
export function verifyUnsubscribeToken(
  token: string | null | undefined,
  now: Date = new Date(),
): VerifiedUnsubscribe | null {
  const key = signingKey()
  if (!key) return null

  const value = (token ?? '').trim()
  if (value.length === 0 || value.length > 256) return null

  const parts = value.split('.')
  if (parts.length !== 4) return null
  const [userId, scope, expText, signature] = parts as [string, string, string, string]

  if (!/^[0-9a-f-]{36}$/.test(userId)) return null
  if (!SCOPES.includes(scope as UnsubscribeScope)) return null
  if (!/^\d{1,12}$/.test(expText)) return null
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(signature)) return null

  const exp = Number(expText)
  if (exp * 1000 < now.getTime()) return null

  const expected = sign(key, `${userId}.${scope}.${expText}`)
  const a = Buffer.from(signature, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  return { userId, scope: scope as UnsubscribeScope }
}
