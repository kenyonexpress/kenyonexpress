import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verify Twilio webhook signature using HMAC-SHA1.
 * Twilio uses signature header format: "twilio_signature" = base64(HMAC-SHA1(URL + POST params))
 */
export async function verifyTwilioWebhook(
  url: string,
  data: Record<string, string>,
  signature: string,
  authToken: string,
): Promise<boolean> {
  try {
    // Build the string to sign: URL + sorted POST parameters
    let stringToSign = url

    // Sort parameters alphabetically and append
    const sortedKeys = Object.keys(data).sort()
    for (const key of sortedKeys) {
      stringToSign += key + data[key]
    }

    // Compute HMAC-SHA1
    const expectedSignature = createHmac('sha1', authToken).update(stringToSign).digest('base64')

    // Use timing-safe comparison to prevent timing attacks
    return timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
  } catch {
    return false
  }
}

/**
 * Detect STOP keyword in incoming SMS (Twilio webhook body).
 * Returns true if message is a STOP/UNSTOP keyword.
 */
export function isSmsStopKeyword(message: string): boolean {
  const normalized = message.trim().toUpperCase()
  return ['STOP', 'UNSTOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(normalized)
}

/**
 * Check if current time is within quiet hours for a given timezone.
 */
export function isWithinQuietHours(
  quietStart: string | null,
  quietEnd: string | null,
  timezone = 'Asia/Jerusalem',
): boolean {
  if (!quietStart || !quietEnd) return false

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const now = new Date()
    const timeStr = formatter.format(now)
    const parts = timeStr.split(':')
    if (parts.length !== 2) return false

    const hours = Number.parseInt(parts[0] ?? '', 10)
    const minutes = Number.parseInt(parts[1] ?? '', 10)

    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return false
    }

    const currentMinutes = hours * 60 + minutes

    const startParts = quietStart.split(':')
    if (startParts.length !== 2) return false

    const startHour = Number.parseInt(startParts[0] ?? '', 10)
    const startMin = Number.parseInt(startParts[1] ?? '', 10)

    const endParts = quietEnd.split(':')
    if (endParts.length !== 2) return false

    const endHour = Number.parseInt(endParts[0] ?? '', 10)
    const endMin = Number.parseInt(endParts[1] ?? '', 10)

    if (
      Number.isNaN(startHour) ||
      Number.isNaN(startMin) ||
      Number.isNaN(endHour) ||
      Number.isNaN(endMin)
    ) {
      return false
    }

    const startMinutes = startHour * 60 + startMin
    const endMinutes = endHour * 60 + endMin

    // If end time is before start time, it wraps to next day
    if (endMinutes < startMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes
  } catch {
    return false
  }
}
