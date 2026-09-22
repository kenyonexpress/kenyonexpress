import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * A shareable snapshot of a wishlist.
 *
 * STATELESS, same reason as the order-tracking token: a share link that
 * waited on a migration would not work until somebody applied it. The token
 * carries the product ids and an expiry; whoever holds it sees those products,
 * not the owner's name, email or other saves.
 *
 * THE LIST IS A SNAPSHOT. Adding or removing a heart after the link is minted
 * does not change what the recipient sees. That is the point of a share, not a
 * defect: a link that mutated under them would be a live view of someone
 * else's account.
 */

const VERSION = 'KWS1'
const DERIVATION_LABEL = 'wishlist-share/v1'
export const DEFAULT_TTL_DAYS = 30
export const MAX_SHARED_PRODUCTS = 40

export class WishlistShareSecretMissingError extends Error {
  constructor() {
    super('no secret available to sign wishlist share links')
    this.name = 'WishlistShareSecretMissingError'
  }
}

export function wishlistShareSigningKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const dedicated = env.WISHLIST_SHARE_SECRET
  if (dedicated && dedicated.length >= 16) return Buffer.from(dedicated, 'utf8')
  const base = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || base.length < 20) throw new WishlistShareSecretMissingError()
  return createHmac('sha256', base).update(DERIVATION_LABEL, 'utf8').digest()
}

interface TokenPayload {
  v: 1
  p: string[]
  e: number
}

function sign(signingInput: string, key: Buffer): string {
  return createHmac('sha256', key).update(signingInput, 'utf8').digest('base64url')
}

export function mintWishlistShareToken(
  productIds: readonly string[],
  options: { ttlDays?: number; now?: Date; env?: NodeJS.ProcessEnv } = {},
): string {
  const unique = [...new Set(productIds.filter((id) => id.length > 0))].sort()
  if (unique.length === 0) throw new Error('wishlist share needs at least one product')
  const clipped = unique.slice(0, MAX_SHARED_PRODUCTS)
  const now = options.now ?? new Date()
  const ttl = options.ttlDays ?? DEFAULT_TTL_DAYS
  const payload: TokenPayload = {
    v: 1,
    p: clipped,
    e: Math.floor(now.getTime() / 1000) + ttl * 86_400,
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signingInput = `${VERSION}.${body}`
  return `${signingInput}.${sign(signingInput, wishlistShareSigningKey(options.env))}`
}

export type WishlistShareVerdict =
  | { ok: true; productIds: string[]; expiresAt: Date }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' }

export function verifyWishlistShareToken(
  token: string | null | undefined,
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {},
): WishlistShareVerdict {
  const raw = (token ?? '').trim()
  if (raw.length < 20 || raw.length > 4096) return { ok: false, reason: 'malformed' }
  const parts = raw.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: 'malformed' }
  const body = parts[1] ?? ''
  const mac = parts[2] ?? ''

  let expected: string
  try {
    expected = sign(`${VERSION}.${body}`, wishlistShareSigningKey(options.env))
  } catch {
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
  if (
    payload?.v !== 1 ||
    !Array.isArray(payload.p) ||
    payload.p.length === 0 ||
    typeof payload.e !== 'number'
  ) {
    return { ok: false, reason: 'malformed' }
  }
  if (payload.p.some((id) => typeof id !== 'string' || id.length === 0)) {
    return { ok: false, reason: 'malformed' }
  }
  const now = options.now ?? new Date()
  if (payload.e * 1000 <= now.getTime()) return { ok: false, reason: 'expired' }
  return { ok: true, productIds: payload.p, expiresAt: new Date(payload.e * 1000) }
}

export function wishlistShareUrl(
  siteUrl: string,
  productIds: readonly string[],
  options: { ttlDays?: number; now?: Date; env?: NodeJS.ProcessEnv } = {},
): string | null {
  try {
    const token = mintWishlistShareToken(productIds, options)
    return `${siteUrl.replace(/\/+$/, '')}/wishlist/s/${token}`
  } catch {
    return null
  }
}
