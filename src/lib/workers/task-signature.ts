/**
 * Request signing between the Next app and the Cloudflare Worker.
 *
 * WebCrypto only, so the SAME file runs on Vercel's Node runtime, on the edge
 * runtime and inside the Worker (see task-contracts.ts for the import rule).
 *
 * The scheme is Stripe's: `X-KE-Signature: t=<unix seconds>,v1=<hex>` where
 * the hex is HMAC-SHA256 over `${t}.${body}`. Binding the timestamp into the
 * signed string and refusing anything older than the tolerance closes replay:
 * a captured request is dead after five minutes, and a request with its
 * timestamp edited fails the MAC.
 *
 * The comparison is constant time by construction (XOR over every byte,
 * never an early return), because `crypto.subtle.timingSafeEqual` exists
 * only on Cloudflare and `node:crypto` does not exist on the Worker.
 */

export const SIGNATURE_HEADER = 'X-KE-Signature'
export const DEFAULT_TOLERANCE_SECONDS = 300

const encoder = new TextEncoder()

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function mac(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await hmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`))
  return toHex(signature)
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** The header value for `body`, signed now (or at `nowMs`). */
export async function signTask(secret: string, body: string, nowMs = Date.now()): Promise<string> {
  const timestamp = Math.floor(nowMs / 1000)
  return `t=${timestamp},v1=${await mac(secret, timestamp, body)}`
}

export function parseSignatureHeader(header: string | null): { t: number; v1: string } | null {
  if (!header) return null
  let t: number | null = null
  let v1: string | null = null
  for (const part of header.split(',')) {
    const [k, v] = part.trim().split('=', 2)
    if (k === 't' && v && /^\d+$/.test(v)) t = Number(v)
    if (k === 'v1' && v && /^[0-9a-f]{64}$/.test(v)) v1 = v
  }
  return t !== null && v1 !== null ? { t, v1 } : null
}

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'malformed' | 'expired' | 'mismatch' | 'no-secret' }

export async function verifyTaskSignature(
  secret: string | undefined,
  header: string | null,
  body: string,
  options: { nowMs?: number; toleranceSeconds?: number } = {},
): Promise<VerifyOutcome> {
  if (!secret) return { ok: false, reason: 'no-secret' }
  if (!header) return { ok: false, reason: 'missing' }
  const parsed = parseSignatureHeader(header)
  if (!parsed) return { ok: false, reason: 'malformed' }
  const now = Math.floor((options.nowMs ?? Date.now()) / 1000)
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  if (Math.abs(now - parsed.t) > tolerance) return { ok: false, reason: 'expired' }
  const expected = await mac(secret, parsed.t, body)
  return constantTimeEqualHex(expected, parsed.v1)
    ? { ok: true }
    : { ok: false, reason: 'mismatch' }
}
