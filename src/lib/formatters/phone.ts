/**
 * Phone number formatting for Hebrew/Israeli context.
 * All inputs default to +972, all displays use Israeli local format.
 */

/**
 * Format a phone number for display in Israeli local format.
 * Input can be international (+972...) or local (05...).
 * Output: "050-123-4567" or similar.
 */
export function formatPhoneIL(value: string | null | undefined): string {
  if (!value) return ''

  // Strip all non-digits
  const digits = value.replace(/\D/g, '')

  // Handle international format +972...
  let local = digits
  if (digits.startsWith('972')) {
    local = `0${digits.slice(3)}`
  }

  // Format as 0XX-XXX-XXXX or 0XX-XXXXXXX (various patterns exist)
  if (local.length === 10) {
    return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`
  }

  if (local.length === 9) {
    return `${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`
  }

  return local
}

/**
 * Normalize a phone input to E.164 international format: +972...
 * Accepts Israeli local format (050..., 052..., etc.) or international.
 */
export function normalizePhoneIL(value: string): string {
  const digits = value.replace(/\D/g, '')

  if (digits.startsWith('972')) {
    return `+${digits}`
  }

  if (digits.startsWith('0') && digits.length >= 9) {
    return `+972${digits.slice(1)}`
  }

  // If it's already short or malformed, pass through
  return value
}

/**
 * Apply Israeli phone mask to input value as user types.
 * Returns formatted value for display in input.
 * Format: 0XX-XXX-XXXX
 */
export function maskPhoneIL(value: string): string {
  const digits = value.replace(/\D/g, '')

  // Ensure it starts with 0 for Israeli local number
  if (!digits) return ''

  const withPrefix = digits.startsWith('0') ? digits : `0${digits}`
  const parts: string[] = []

  // 0XX
  if (withPrefix.length >= 1) {
    parts.push(withPrefix.slice(0, Math.min(3, withPrefix.length)))
  }

  // XXX
  if (withPrefix.length > 3) {
    parts.push(withPrefix.slice(3, Math.min(6, withPrefix.length)))
  }

  // XXXX
  if (withPrefix.length > 6) {
    parts.push(withPrefix.slice(6, Math.min(10, withPrefix.length)))
  }

  return parts.join('-')
}

/**
 * Default placeholder for Israeli phone inputs.
 */
export const PHONE_PLACEHOLDER_IL = '050-123-4567'

/**
 * Pattern for HTML5 validation of Israeli phone numbers.
 * Accepts 0XX-XXX-XXXX or similar formats.
 */
export const PHONE_PATTERN_IL = '^0\\d{1,2}-?\\d{3}-?\\d{4}$'
