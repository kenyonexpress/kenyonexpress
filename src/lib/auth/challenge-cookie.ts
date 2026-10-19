import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * A short-lived, HMAC-signed cookie that carries a WebAuthn challenge between
 * the "options" call and the "verify" call (rc5 F15). Signed, not encrypted:
 * a challenge is not secret, but it must be the one THIS server issued, for
 * THIS purpose, and not expired.
 *
 * The key is PASSKEY_CHALLENGE_SECRET, or derived from the Supabase service
 * key when that is unset, so production works without a new variable. A
 * rotation of either only voids challenges in flight (five minutes).
 */
export const CHALLENGE_COOKIE = 'ke_wa_chal'
export const CHALLENGE_TTL_S = 300

export type ChallengePurpose = 'register' | 'authenticate'

export interface ChallengeClaims {
  c: string
  p: ChallengePurpose
  u: string | null
  e: number
}

function key(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const base =
    env.PASSKEY_CHALLENGE_SECRET ?? env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || base.length < 16) return null
  return createHmac('sha256', base).update('ke-passkey-challenge-v1').digest()
}

function sign(body: string, k: Buffer): string {
  return createHmac('sha256', k).update(body).digest('base64url')
}

export function sealChallenge(
  claims: Omit<ChallengeClaims, 'e'>,
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const k = key(env)
  if (!k) return null
  const body = Buffer.from(
    JSON.stringify({ ...claims, e: Math.floor(now / 1000) + CHALLENGE_TTL_S }),
  ).toString('base64url')
  return `${body}.${sign(body, k)}`
}

export function openChallenge(
  value: string | undefined,
  purpose: ChallengePurpose,
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): ChallengeClaims | null {
  const k = key(env)
  if (!k || !value) return null
  const [body, mac] = value.split('.')
  if (!body || !mac) return null
  const expected = Buffer.from(sign(body, k))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ChallengeClaims
    if (claims.p !== purpose || typeof claims.c !== 'string') return null
    if (claims.e < Math.floor(now / 1000)) return null
    return claims
  } catch {
    return null
  }
}
