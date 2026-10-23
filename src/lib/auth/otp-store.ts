/**
 * OTP code storage and verification
 *
 * Stores OTP codes temporarily in Supabase with expiration.
 * Used for both WhatsApp and email OTP flows.
 */

import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

const OTP_EXPIRY_MINUTES = 10
const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000

export type OtpChannel = 'whatsapp' | 'email' | 'sms'

/**
 * Store an OTP code for later verification
 */
export async function storeOtpCode(params: {
  identifier: string // email or phone number
  code: string
  channel: OtpChannel
}): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient()

  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString()

  // Delete any existing OTP for this identifier
  await admin.from('otp_codes').delete().eq('identifier', params.identifier)

  const { error } = await admin.from('otp_codes').insert({
    identifier: params.identifier,
    code: params.code,
    channel: params.channel,
    expires_at: expiresAt,
  })

  if (error) {
    log.error('otp_store.insert_failed', { reason: error.message })
    return { success: false, error: 'Failed to store OTP' }
  }

  return { success: true }
}

/**
 * Verify an OTP code and consume it (delete after verification)
 */
export async function verifyOtpCode(params: {
  identifier: string
  code: string
  channel?: OtpChannel
}): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient()

  let query = admin
    .from('otp_codes')
    .select('*')
    .eq('identifier', params.identifier)
    .eq('code', params.code)
    .gte('expires_at', new Date().toISOString())

  if (params.channel) {
    query = query.eq('channel', params.channel)
  }

  const { data: storedOtp, error } = await query.single()

  if (error || !storedOtp) {
    log.warn('otp_store.verification_failed', {
      identifier_suffix: params.identifier.slice(-4),
      reason: error?.message || 'Code not found or expired',
    })
    return { success: false, error: 'קוד שגוי או פג תוקפו' }
  }

  // Delete the used code
  await admin.from('otp_codes').delete().eq('id', storedOtp.id)

  log.info('otp_store.verified', {
    identifier_suffix: params.identifier.slice(-4),
    channel: storedOtp.channel,
  })

  return { success: true }
}

/**
 * Clean up expired OTP codes (should be run periodically)
 */
export async function cleanupExpiredOtps(): Promise<number> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('otp_codes')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id')

  if (error) {
    log.error('otp_store.cleanup_failed', { reason: error.message })
    return 0
  }

  const count = data?.length || 0
  if (count > 0) {
    log.info('otp_store.cleaned_up', { count })
  }

  return count
}
