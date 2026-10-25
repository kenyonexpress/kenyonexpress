import { headers as nextHeaders } from 'next/headers'
import { cache } from 'react'

/**
 * Header name for the CSP nonce, passed from middleware to the rendering layer.
 *
 * This header is INTERNAL — it is never sent to the client. The proxy generates
 * a unique nonce per request, attaches it to both the request (so components can
 * read it) and the CSP header in the response, and the nonce is visible in the
 * CSP header but not as a standalone header.
 */
export const CSP_NONCE_HEADER = 'x-csp-nonce'

/**
 * Generate a cryptographically secure random nonce.
 *
 * Base64-encoded random bytes provide a nonce that is unique per request and
 * cannot be predicted. 16 bytes (128 bits) is the minimum recommended by OWASP.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64')
}

/**
 * Read the CSP nonce from request headers.
 *
 * This is a server-only function — it reads from Next.js headers() which is
 * available in Server Components, Server Actions, and Route Handlers.
 *
 * The nonce is injected by src/proxy.ts middleware, so it is guaranteed to exist
 * on every request that passes through the middleware matcher.
 *
 * Cached per request so multiple components reading the nonce don't pay for
 * multiple header lookups.
 */
const _getNonce = cache(async (): Promise<string | null> => {
  const headersList = await nextHeaders()
  return headersList.get(CSP_NONCE_HEADER)
})
