/**
 * The wishlist share link's token: minted here, checked here, and turned into
 * a URL here, so the action that stores it, the page that reads it and the
 * card that shows it cannot disagree about its shape.
 *
 * WEB CRYPTO, NOT `node:crypto`, on purpose. The share card is a client
 * component that builds the URL the shopper copies, so this module is in the
 * browser bundle; `globalThis.crypto.getRandomValues` exists in every browser
 * and in Node since 19, while a `node:crypto` import would fail the client
 * build. Minting only ever happens on the server (the action), but the module
 * has to be importable from both sides.
 *
 * 24 random bytes as base64url is 32 characters and 192 bits, which is the
 * same order as a session id. The database CHECK (248) is 32..64 characters;
 * `isShareToken` mirrors it, plus the alphabet, so a token pasted into the URL
 * with a stray character is refused before the database is asked.
 */

export const SHARE_TOKEN_BYTES = 24
export const SHARE_TOKEN_MIN_LENGTH = 32
export const SHARE_TOKEN_MAX_LENGTH = 64

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,64}$/

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function base64url(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number)
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63] + B64URL[n & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = (bytes[i] as number) << 16
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63]
  } else if (rest === 2) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8)
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63]
  }
  return out
}

/** A fresh, unguessable share token: 32 URL-safe characters. */
export function mintShareToken(): string {
  const bytes = new Uint8Array(SHARE_TOKEN_BYTES)
  globalThis.crypto.getRandomValues(bytes)
  return base64url(bytes)
}

/** True for a string the database CHECK and the URL alphabet both accept. */
export function isShareToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_SHAPE.test(value)
}

export function sharedWishlistPath(token: string): string {
  return `/wishlist/shared/${token}`
}

/**
 * The absolute URL a friend opens. `siteUrl` may carry a trailing slash (the
 * env var has been written both ways); one join, no double slash either way.
 */
export function sharedWishlistUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${sharedWishlistPath(token)}`
}
