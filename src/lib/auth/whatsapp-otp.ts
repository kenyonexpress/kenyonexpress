/**
 * WhatsApp OTP via Meta Cloud API
 *
 * Sends one-time passwords via WhatsApp Business API using the official
 * Meta Cloud API. This is NOT SMS - it's a WhatsApp message.
 *
 * Environment variables required:
 * - META_WHATSAPP_PHONE_NUMBER_ID: Phone number ID from Meta Business
 * - META_WHATSAPP_ACCESS_TOKEN: Access token for Cloud API
 * - META_WHATSAPP_BUSINESS_ACCOUNT_ID: Business account ID
 */

import { log } from '@/lib/observability/log'

const CLOUD_API_VERSION = 'v21.0'
const CLOUD_API_BASE = 'https://graph.facebook.com'

interface WhatsAppOtpResult {
  success: boolean
  messageId?: string
  error?: string
}

export function whatsAppOtpEnabled(): boolean {
  return Boolean(
    process.env.META_WHATSAPP_PHONE_NUMBER_ID && process.env.META_WHATSAPP_ACCESS_TOKEN,
  )
}

/**
 * Generates a 6-digit OTP code
 */
export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/**
 * Sends an OTP code via WhatsApp using Meta Cloud API
 *
 * @param phone - E.164 format phone number (e.g. "+972501234567")
 * @param code - 6-digit OTP code
 * @returns Result with success status and message ID or error
 */
export async function sendWhatsAppOtp(phone: string, code: string): Promise<WhatsAppOtpResult> {
  if (!whatsAppOtpEnabled()) {
    log.error('whatsapp_otp.not_configured', {})
    return { success: false, error: 'WhatsApp OTP not configured' }
  }

  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN

  const url = `${CLOUD_API_BASE}/${CLOUD_API_VERSION}/${phoneNumberId}/messages`

  // Hebrew message: "קוד האימות שלך הוא: {code}. הקוד תקף ל-10 דקות."
  const message = `קוד האימות שלך הוא: ${code}. הקוד תקף ל-10 דקות.`

  const payload = {
    messaging_product: 'whatsapp',
    to: phone.replace('+', ''), // Meta API expects without the + prefix
    type: 'text',
    text: {
      body: message,
    },
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      log.error('whatsapp_otp.send_failed', {
        status: response.status,
        error: data.error?.message || 'Unknown error',
      })
      return { success: false, error: data.error?.message || 'Failed to send WhatsApp OTP' }
    }

    const messageId = data.messages?.[0]?.id
    log.info('whatsapp_otp.sent', { messageId, phone_suffix: phone.slice(-4) })

    return { success: true, messageId }
  } catch (error) {
    log.error('whatsapp_otp.network_error', {
      reason: error instanceof Error ? error.message : 'Unknown error',
    })
    return { success: false, error: 'Network error sending WhatsApp OTP' }
  }
}

/**
 * Error messages in Hebrew for WhatsApp OTP failures
 */
export function whatsAppOtpErrorHebrew(errorMsg: string): string {
  if (errorMsg.includes('not configured')) {
    return 'שירות WhatsApp אינו זמין כרגע'
  }
  if (errorMsg.includes('rate limit') || errorMsg.includes('too many')) {
    return 'יותר מדי ניסיונות — נסו שוב מאוחר יותר'
  }
  if (errorMsg.includes('invalid phone') || errorMsg.includes('Invalid parameter')) {
    return 'מספר הטלפון אינו תקין'
  }
  return 'שליחת קוד ב-WhatsApp נכשלה — נסו שוב'
}
