import 'server-only'

import { createHmac } from 'node:crypto'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/** Three sends per phone per fifteen minutes (C90). */
export const WA_OTP_SEND_LIMIT = 3
export const WA_OTP_SEND_WINDOW_SECONDS = 15 * 60

/**
 * `wa_otp_enabled` (migration 312, seeded false). Unlike the Phase 2 flags this
 * FAILS CLOSED: until Meta business verification is done, any doubt means off.
 * FLAG_WA_OTP_ENABLED=1 is the hard override.
 */
export async function waOtpEnabled(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const override = env.FLAG_WA_OTP_ENABLED?.trim().toLowerCase()
  if (override === '1' || override === 'true') return true
  try {
    const { data, error } = await createAdminClient()
      .from('feature_flags')
      .select('bool_value')
      .eq('key', 'wa_otp_enabled')
      .maybeSingle()
    if (error) return false
    return (data as { bool_value: boolean | null } | null)?.bool_value === true
  } catch {
    return false
  }
}

export type OtpAttempt = {
  phone: string
  userId?: string | null
  kind: 'send' | 'verify'
  channel: 'whatsapp' | 'email'
  outcome:
    | 'sent'
    | 'fallback_email'
    | 'send_failed'
    | 'rate_limited'
    | 'ok'
    | 'wrong_code'
    | 'expired'
  ip?: string
}

/** Audit row; never blocks or fails the request (the table may not exist yet). */
export async function recordOtpAttempt(
  a: OtpAttempt,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  try {
    const key = env.PASSKEY_CHALLENGE_SECRET ?? env.SUPABASE_SECRET_KEY ?? ''
    const { error } = await createAdminClient()
      .from('otp_attempts' as never)
      .insert({
        phone_hash: createHmac('sha256', key).update(`otp-attempt|${a.phone}`).digest('hex'),
        phone_suffix: a.phone.slice(-4),
        user_id: a.userId ?? null,
        kind: a.kind,
        channel: a.channel,
        outcome: a.outcome,
        ip: a.ip ?? null,
      } as never)
    if (error) log.warn('wa_otp.attempt_record_failed', { reason: error.message })
  } catch (err) {
    log.warn('wa_otp.attempt_record_failed', {
      reason: err instanceof Error ? err.message : 'unknown',
    })
  }
}
