/**
 * Authentication fallback logic
 *
 * Tracks auth attempts and determines when to fall back from one method to another.
 * Default strategy: after N failed passkey/WhatsApp attempts, offer email OTP.
 */

import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_FALLBACK_THRESHOLD = 3 // Fall back after 3 failures
const ATTEMPT_WINDOW_MINUTES = 60 // Look at last 60 minutes of attempts

export type AuthAttemptType = 'passkey' | 'whatsapp_otp' | 'email_otp' | 'password'

export interface AuthAttempt {
  id: string
  user_id: string | null
  email: string | null
  phone: string | null
  attempt_type: AuthAttemptType
  success: boolean
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

/**
 * Record an authentication attempt
 */
export async function recordAuthAttempt(params: {
  userId?: string
  email?: string
  phone?: string
  attemptType: AuthAttemptType
  success: boolean
  ipAddress?: string
  userAgent?: string
}): Promise<void> {
  const admin = createAdminClient()

  const { error } = await admin.from('auth_attempts').insert({
    user_id: params.userId || null,
    email: params.email || null,
    phone: params.phone || null,
    attempt_type: params.attemptType,
    success: params.success,
    ip_address: params.ipAddress || null,
    user_agent: params.userAgent || null,
  })

  if (error) {
    log.error('auth_attempts.record_failed', { reason: error.message })
  }
}

/**
 * Get recent auth attempts for a user/email/phone
 */
export async function getRecentAuthAttempts(params: {
  userId?: string
  email?: string
  phone?: string
  attemptType?: AuthAttemptType
  windowMinutes?: number
}): Promise<AuthAttempt[]> {
  const admin = createAdminClient()
  const windowMinutes = params.windowMinutes || ATTEMPT_WINDOW_MINUTES

  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()

  let query = admin
    .from('auth_attempts')
    .select('*')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })

  if (params.userId) {
    query = query.eq('user_id', params.userId)
  }
  if (params.email) {
    query = query.eq('email', params.email)
  }
  if (params.phone) {
    query = query.eq('phone', params.phone)
  }
  if (params.attemptType) {
    query = query.eq('attempt_type', params.attemptType)
  }

  const { data } = await query

  return (data || []) as AuthAttempt[]
}

/**
 * Count consecutive failed attempts
 */
export async function countConsecutiveFailures(params: {
  userId?: string
  email?: string
  phone?: string
  attemptType?: AuthAttemptType
  windowMinutes?: number
}): Promise<number> {
  const attempts = await getRecentAuthAttempts(params)

  let count = 0
  for (const attempt of attempts) {
    if (!attempt.success) {
      count++
    } else {
      // Stop counting at first success
      break
    }
  }

  return count
}

/**
 * Should we fall back to email OTP?
 * Returns true if user has failed N attempts with passkey/whatsapp
 */
export async function shouldFallbackToEmail(params: {
  userId?: string
  email?: string
  phone?: string
  threshold?: number
  windowMinutes?: number
}): Promise<boolean> {
  const threshold = params.threshold || DEFAULT_FALLBACK_THRESHOLD

  // Count failures for both passkey and whatsapp_otp
  const passkeyFailures = await countConsecutiveFailures({
    ...params,
    attemptType: 'passkey',
  })

  const whatsappFailures = await countConsecutiveFailures({
    ...params,
    attemptType: 'whatsapp_otp',
  })

  const totalFailures = passkeyFailures + whatsappFailures

  if (totalFailures >= threshold) {
    log.info('auth_fallback.email_offered', {
      user_id: params.userId,
      email: params.email,
      phone: params.phone,
      passkey_failures: passkeyFailures,
      whatsapp_failures: whatsappFailures,
    })
    return true
  }

  return false
}

/**
 * Get auth attempt statistics for a user
 */
export async function getAuthStats(params: {
  userId?: string
  email?: string
  phone?: string
  windowMinutes?: number
}): Promise<{
  total: number
  successful: number
  failed: number
  byType: Record<AuthAttemptType, { total: number; successful: number; failed: number }>
}> {
  const attempts = await getRecentAuthAttempts(params)

  const stats = {
    total: attempts.length,
    successful: 0,
    failed: 0,
    byType: {
      passkey: { total: 0, successful: 0, failed: 0 },
      whatsapp_otp: { total: 0, successful: 0, failed: 0 },
      email_otp: { total: 0, successful: 0, failed: 0 },
      password: { total: 0, successful: 0, failed: 0 },
    } as Record<AuthAttemptType, { total: number; successful: number; failed: number }>,
  }

  for (const attempt of attempts) {
    if (attempt.success) {
      stats.successful++
    } else {
      stats.failed++
    }

    const typeStats = stats.byType[attempt.attempt_type]
    if (typeStats) {
      typeStats.total++
      if (attempt.success) {
        typeStats.successful++
      } else {
        typeStats.failed++
      }
    }
  }

  return stats
}
