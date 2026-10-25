/**
 * F66: Fraud detection for signup flow
 * - Blocks duplicate emails (case-insensitive)
 * - Blocks disposable email domains
 * - Blocks same IP creating >3 accounts in 1h
 */

import disposableEmails from '@/lib/disposable-emails.json'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Check if email domain is disposable
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1]
  if (!domain) return false
  return disposableEmails.includes(domain)
}

/**
 * Check if email already exists (case-insensitive)
 */
export async function isDuplicateEmail(email: string): Promise<boolean> {
  const admin = createAdminClient()

  // Check auth.users table via admin client
  const { data, error } = await admin.auth.admin.listUsers()

  if (error) {
    log.error('fraud.duplicate_email_check_failed', { error: error.message })
    // Fail open: let signup proceed if check fails
    return false
  }

  const normalizedEmail = email.toLowerCase().trim()
  const exists = data.users.some((user) => user.email?.toLowerCase().trim() === normalizedEmail)

  return exists
}

/**
 * Check IP account creation rate
 * Returns true if IP has created >3 accounts in the last hour
 */
export async function isIpAccountCreationAbuse(ip: string): Promise<boolean> {
  const admin = createAdminClient()

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  // Query fraud_ip_signup_log for this IP in last hour
  const { data, error } = await admin
    .from('fraud_ip_signup_log')
    .select('id')
    .eq('ip_address', ip)
    .gte('created_at', oneHourAgo)

  if (error) {
    log.error('fraud.ip_signup_check_failed', { error: error.message })
    // Fail open
    return false
  }

  return (data?.length ?? 0) >= 3
}

/**
 * Log IP signup attempt (even if signup fails)
 * This is called after successful signup to track the IP
 */
export async function logIpSignup(
  ip: string,
  userId: string | null,
  email: string,
  blocked: boolean,
  blockReason: string | null,
): Promise<void> {
  const admin = createAdminClient()

  const { error } = await admin.from('fraud_ip_signup_log').insert({
    ip_address: ip,
    user_id: userId,
    email,
    blocked,
    block_reason: blockReason,
  })

  if (error) {
    log.error('fraud.log_ip_signup_failed', { error: error.message })
  }
}
