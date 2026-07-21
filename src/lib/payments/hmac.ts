import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verifies Cardcom webhook HMAC.
 * Signature is expected as hex HMAC-SHA256 of the raw body using CARDCOM_WEBHOOK_SECRET.
 */
export function verifyCardcomSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const provided = signatureHeader
    .trim()
    .toLowerCase()
    .replace(/^sha256=/i, '')
  try {
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Test helper: sign a raw body the same way the verifier expects. */
export function signCardcomBody(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}
