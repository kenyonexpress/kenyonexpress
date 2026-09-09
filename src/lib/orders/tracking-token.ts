import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The credential on the "track my order" link in the shipped email.
 *
 * WHY A TOKEN AND NOT A LOGIN
 *
 * The customer reading "your order shipped" on a phone is the same person who
 * checked out as a guest, or who signed up with a magic link three months ago
 * and is signed out. Sending them to `/account/orders` means a login wall
 * between them and the one fact they want. The link therefore carries its own
 * proof.
 *
 * WHAT IT PROVES, AND WHAT IT DOES NOT
 *
 * It proves this URL was minted by the platform for this order. That is all. It
 * is a bearer credential -- whoever holds the link sees the page -- so the page
 * shows only what a delivery status needs: the steps, the times, the carrier
 * and number, the estimate, and the product names. No email, no address, no
 * card, no prices. Forwarding the mail to a family member must not forward the
 * customer's billing details with it.
 *
 * STATELESS, ON PURPOSE
 *
 * The gift claim token (`lib/gifts/claim-token.ts`) is 256 random bits with the
 * hash stored in a column, because it is single-use and must be burnable. This
 * one is not: it grants a read that can be repeated, and storing it would mean
 * a new column, which means a migration in `migrations/pending`, which means
 * this link does not work until somebody applies it. An HMAC over the order id
 * needs no schema at all.
 *
 * THE SECRET IS DERIVED, AND THAT IS THE WHOLE POINT
 *
 * `VOUCHER_QR_SECRET` is unset in production. Every voucher scan 500s because a
 * feature was shipped depending on an env var nobody set, and it fails at the
 * moment a customer is standing at a counter. A NEW required env var here would
 * be the same mistake a second time: the tracking page would 500 for every
 * customer until somebody noticed.
 *
 * So the key is derived from a secret that is definitionally present -- the
 * service key the server already needs in order to read the order at all -- via
 * HMAC with a fixed label. That is standard key separation: the derived key
 * cannot be turned back into the service key, and a token signed with it says
 * nothing about it. `ORDER_TRACKING_SECRET` overrides when set, so the link can
 * be moved onto its own key later without invalidating anything that matters
 * (a stale tracking link expiring early is a non-event).
 */

const VERSION = 'KET1'
const DERIVATION_LABEL = 'order-tracking-link/v1'

/** A shipped parcel is interesting for weeks, not months. */
export const DEFAULT_TTL_DAYS = 60

export class OrderTrackingSecretMissingError extends Error {
  constructor() {
    super('no secret available to sign order tracking links')
    this.name = 'OrderTrackingSecretMissingError'
  }
}

/**
 * Resolution order: the dedicated secret, then a key derived from the server's
 * Supabase secret. Throws only when the process has neither, which is a process
 * that cannot read an order either.
 */
export function trackingSigningKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const dedicated = env.ORDER_TRACKING_SECRET
  if (dedicated && dedicated.length >= 16) return Buffer.from(dedicated, 'utf8')

  const base = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || base.length < 20) throw new OrderTrackingSecretMissingError()
  return createHmac('sha256', base).update(DERIVATION_LABEL, 'utf8').digest()
}

interface TokenPayload {
  v: 1
  /** order id */
  o: string
  /** expiry, unix seconds */
  e: number
}

function sign(signingInput: string, key: Buffer): string {
  return createHmac('sha256', key).update(signingInput, 'utf8').digest('base64url')
}

export interface MintOptions {
  ttlDays?: number
  /** Injected in tests. */
  now?: Date
  env?: NodeJS.ProcessEnv
}

export function mintOrderTrackingToken(orderId: string, options: MintOptions = {}): string {
  const now = options.now ?? new Date()
  const ttl = options.ttlDays ?? DEFAULT_TTL_DAYS
  const payload: TokenPayload = {
    v: 1,
    o: orderId,
    e: Math.floor(now.getTime() / 1000) + ttl * 86400,
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signingInput = `${VERSION}.${body}`
  return `${signingInput}.${sign(signingInput, trackingSigningKey(options.env))}`
}

export type TrackingVerdict =
  | { ok: true; orderId: string; expiresAt: Date }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'wrong_order' }

/**
 * `expectedOrderId` is required, not optional. The page has the id in its path
 * already; verifying the token without binding it to that id would let a valid
 * token for order A open the page of order B, since the page would happily read
 * whatever the path said.
 */
export function verifyOrderTrackingToken(
  token: string | null | undefined,
  expectedOrderId: string,
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {},
): TrackingVerdict {
  const raw = (token ?? '').trim()
  // Cheap shape check first: `/order/<id>/tracking?t=<1MB of junk>` should cost
  // a regex, not an HMAC over a megabyte.
  if (raw.length < 20 || raw.length > 512) return { ok: false, reason: 'malformed' }

  const parts = raw.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: 'malformed' }
  const body = parts[1] ?? ''
  const mac = parts[2] ?? ''

  let expected: string
  try {
    expected = sign(`${VERSION}.${body}`, trackingSigningKey(options.env))
  } catch {
    // No key means nothing can be verified. Treated as a bad signature rather
    // than a crash: a tracking page is not worth a 500.
    return { ok: false, reason: 'bad_signature' }
  }

  const a = Buffer.from(mac, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' }
  }

  let payload: TokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (payload?.v !== 1 || typeof payload.o !== 'string' || typeof payload.e !== 'number') {
    return { ok: false, reason: 'malformed' }
  }

  const now = options.now ?? new Date()
  if (payload.e * 1000 <= now.getTime()) return { ok: false, reason: 'expired' }
  if (payload.o !== expectedOrderId) return { ok: false, reason: 'wrong_order' }

  return { ok: true, orderId: payload.o, expiresAt: new Date(payload.e * 1000) }
}

/** The absolute URL that goes in the email. */
export function orderTrackingUrl(
  siteUrl: string,
  orderId: string,
  options: MintOptions = {},
): string | null {
  try {
    const token = mintOrderTrackingToken(orderId, options)
    const base = siteUrl.replace(/\/+$/, '')
    return `${base}/order/${orderId}/tracking?t=${token}`
  } catch {
    // No key: the caller falls back to the account page rather than mailing a
    // link that cannot work.
    return null
  }
}
