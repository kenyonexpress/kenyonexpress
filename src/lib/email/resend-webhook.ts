import crypto from 'node:crypto'

/**
 * Verify Resend webhook signature.
 * Resend signs webhooks with HMAC-SHA256 using the signing secret.
 * @see https://resend.com/docs/webhooks
 */
export async function verifyResendWebhook(body: string, signature: string): Promise<boolean> {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    // No secret configured; cannot verify. Log and reject.
    console.warn('RESEND_WEBHOOK_SECRET not configured; webhook verification disabled')
    return false
  }

  try {
    // Resend signature format: ts=<timestamp>,sig1=<signature>
    const parts = signature.split(',')
    const tsMatch = parts.find((p) => p.startsWith('ts='))
    const sigMatch = parts.find((p) => p.startsWith('sig1='))

    if (!tsMatch || !sigMatch) {
      return false
    }

    const ts = tsMatch.replace('ts=', '')
    const sig = sigMatch.replace('sig1=', '')

    // Reconstruct signed content: timestamp.body
    const signed = `${ts}.${body}`

    // Sign with HMAC-SHA256
    const expectedSig = crypto.createHmac('sha256', secret).update(signed).digest('hex')

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
  } catch {
    return false
  }
}
