import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Webhook authenticity for the multi-account Cardcom integration.
 *
 * Cardcom itself does not sign its callbacks (legacy /Interface/*.aspx sends a
 * bare POST), so authenticity for REAL Cardcom traffic still rests on the
 * unguessable URL secret plus the mandatory server-to-server GetLpResult
 * re-verification. This module adds a second, stronger gate for every caller
 * that CAN sign: our own retry queue re-deliveries, the E2E webhook simulator,
 * and any future Cardcom account configured with a signing proxy. A request
 * carrying the signature header must verify against the account whose terminal
 * number appears in the payload; a request without the header falls back to the
 * URL-secret gate.
 */

export const WEBHOOK_SIGNATURE_HEADER = 'x-ke-webhook-signature'

/** hex(HMAC-SHA256(secret, rawBody)) */
export function computeWebhookSignature(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

/** Constant-time comparison; false on any absence or length mismatch. */
export function verifyWebhookSignature(
  rawBody: string,
  secret: string,
  providedSignature: string | null | undefined,
): boolean {
  if (!providedSignature || !secret) return false
  const expected = Buffer.from(computeWebhookSignature(rawBody, secret), 'utf8')
  const provided = Buffer.from(providedSignature.trim().toLowerCase(), 'utf8')
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}
