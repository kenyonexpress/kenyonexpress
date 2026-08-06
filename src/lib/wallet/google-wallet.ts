import { createSign } from 'node:crypto'
import { log } from '@/lib/observability/log'
import type { GoogleWalletConfig } from './config'

/**
 * Google Wallet, which is two mechanisms and not one.
 *
 * SAVING is a link. A JWT signed with the issuer's service account key carries
 * the whole object inline, and `https://pay.google.com/gp/v/save/<jwt>` creates
 * it on first click. No API call, no OAuth, no network from our side at all —
 * which is why the save button works on a deployment that can reach nothing.
 *
 * UPDATING is an API call, and needs an access token. That is the half that
 * pushes a redeemed voucher off the customer's lock screen, and it is the half
 * that can fail, so it never throws at its callers: a pass left showing ACTIVE
 * for a voucher the counter already burned is a display bug; a redemption that
 * fails because Google was unreachable is a customer standing at a till.
 *
 * `node:crypto` signs both. There is no Google SDK here on purpose: the entire
 * surface used is one RS256 signature and one PATCH.
 */

const SAVE_URL = 'https://pay.google.com/gp/v/save/'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const WALLET_API = 'https://walletobjects.googleapis.com/walletobjects/v1'
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer'

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function signRs256(signingInput: string, privateKeyPem: string): string {
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  return signer.sign(privateKeyPem).toString('base64url')
}

export function encodeJwt(
  claims: Record<string, unknown>,
  privateKeyPem: string,
  header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT' },
): string {
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`
  return `${signingInput}.${signRs256(signingInput, privateKeyPem)}`
}

/**
 * The "Save to Google Wallet" URL for one voucher.
 *
 * `origins` is required by Google and is checked against the page the link is
 * clicked from. An empty or wrong origin makes the save page refuse with a
 * generic error, so it is passed in rather than defaulted.
 *
 * `issuedAt` is a parameter and not `Date.now()`: the same voucher must produce
 * the same link twice, so the page can be cached and two renders do not look
 * like two different passes.
 */
export function buildSaveUrl(
  object: Record<string, unknown>,
  config: GoogleWalletConfig,
  options: { origin: string; issuedAt: Date },
): string {
  const jwt = encodeJwt(
    {
      iss: config.serviceAccountEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(options.issuedAt.getTime() / 1000),
      origins: [options.origin],
      payload: { genericObjects: [object] },
    },
    config.privateKeyPem,
  )
  return `${SAVE_URL}${jwt}`
}

/**
 * Service-account access token, via the JWT bearer grant.
 *
 * Cached until shortly before it expires. Google issues these for an hour and
 * rate limits the endpoint; a token minted per redemption would be a network
 * round trip inside the counter's scan.
 */
let cachedToken: { value: string; expiresAt: number } | null = null

async function accessToken(config: GoogleWalletConfig, now: Date): Promise<string | null> {
  const nowSeconds = Math.floor(now.getTime() / 1000)
  if (cachedToken && cachedToken.expiresAt > nowSeconds + 60) return cachedToken.value

  const assertion = encodeJwt(
    {
      iss: config.serviceAccountEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    },
    config.privateKeyPem,
  )

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!response.ok) {
    log.error('wallet.google_token_failed', { status: response.status })
    return null
  }
  const body = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) return null

  cachedToken = {
    value: body.access_token,
    expiresAt: nowSeconds + (body.expires_in ?? 3600),
  }
  return cachedToken.value
}

/** Test seam. Never called by application code. */
export function __resetGoogleWalletTokenCache(): void {
  cachedToken = null
}

/**
 * Pushes a changed object to Google, which is what moves a pass out of the
 * customer's active list when the counter scans it.
 *
 * NEVER THROWS. It runs after a voucher has already been burned in the
 * database, and there is nothing useful a redemption could do with the failure:
 * the counter has handed the phone back either way. Returns what happened so
 * the caller can log it, and says `skipped` rather than `ok` when the platform
 * is not configured — a "green" that means "did nothing" is the one answer this
 * must never give.
 */
export type WalletPushResult =
  | { outcome: 'ok' }
  | { outcome: 'skipped'; reason: 'not_configured' }
  | { outcome: 'failed'; reason: string }

export async function pushGoogleObjectState(
  objectId: string,
  patch: Record<string, unknown>,
  config: GoogleWalletConfig | null,
  now: Date = new Date(),
): Promise<WalletPushResult> {
  if (!config) return { outcome: 'skipped', reason: 'not_configured' }
  try {
    const token = await accessToken(config, now)
    if (!token) return { outcome: 'failed', reason: 'no_access_token' }

    const response = await fetch(`${WALLET_API}/genericObject/${encodeURIComponent(objectId)}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(patch),
    })
    // 404 is expected and not an error: the customer never saved the pass, so
    // there is no object to move. Treated as done rather than as a failure,
    // because retrying it would never succeed.
    if (response.status === 404) return { outcome: 'ok' }
    if (!response.ok) return { outcome: 'failed', reason: `http_${response.status}` }
    return { outcome: 'ok' }
  } catch (error) {
    return { outcome: 'failed', reason: error instanceof Error ? error.message : 'unknown' }
  }
}
