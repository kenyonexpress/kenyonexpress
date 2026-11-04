import { parseScanInput } from './scan-input'

/**
 * What a partner types or scans at /partner/redeem, classified.
 *
 * Everything the supplier scanner accepts (a signed KEV1 token, a redeem URL
 * carrying one, a 10-symbol short code) plus the 8-digit `partner_pin` printed
 * under the QR on the customer's coupon. The pin is the fallback for a till
 * with no camera and a customer who cannot read a 10-symbol code aloud.
 *
 * Exactly 8 digits once spaces and hyphens are removed, and nothing else: a
 * short code is 10 symbols, so the two shapes cannot collide. Client-safe and
 * pure. Nothing returned here is trusted; the server verifies the token and
 * resolves the pin against the caller's own businesses.
 */

export type PartnerInput =
  | { kind: 'token'; token: string }
  | { kind: 'code'; code: string }
  | { kind: 'pin'; pin: string }
  | { kind: 'invalid' }

export const PARTNER_PIN_PATTERN = /^[0-9]{8}$/

export function parsePartnerInput(raw: string): PartnerInput {
  const trimmed = (raw ?? '').trim()
  const digits = trimmed.replace(/[\s-]/g, '')
  if (PARTNER_PIN_PATTERN.test(digits)) return { kind: 'pin', pin: digits }

  const scanned = parseScanInput(trimmed)
  if (scanned.kind === 'token') return { kind: 'token', token: scanned.token }
  if (scanned.kind === 'code') return { kind: 'code', code: scanned.code }
  return { kind: 'invalid' }
}
