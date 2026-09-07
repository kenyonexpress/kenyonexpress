/**
 * The VAPID application server key, and the one conversion the Push API
 * forces on everybody.
 *
 * The public key is a build-time inline (`NEXT_PUBLIC_`), because the client
 * component needs it inside `pushManager.subscribe()` and shipping it is the
 * design: VAPID's public half is meant to be world-readable. The private half
 * (`VAPID_PRIVATE_KEY`, server only) is not read anywhere yet; it exists so
 * the subscriptions stored today are deliverable the day a sender is built.
 * A key pair minted later would orphan every row saved before it.
 */
export function vapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  return key && key.length > 0 ? key : null
}

/**
 * base64url string -> raw bytes, for `applicationServerKey`.
 *
 * Chromium rejects a base64 STRING key with a cryptic DOMException and only
 * accepts the decoded BufferSource; the padding and +/ mapping below are the
 * standard urlsafe-to-standard base64 shim. `atob` and not Buffer: this runs
 * in the browser bundle, and pulling Buffer's polyfill in for one call is a
 * bundle-size own goal.
 */
export function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=')
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i)
  }
  return bytes
}
