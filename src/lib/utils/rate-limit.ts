import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export async function getClientIp(): Promise<string> {
  const headersList = await headers()
  const forwarded = headersList.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() ?? headersList.get('x-real-ip') ?? 'unknown'
}

export async function checkRateLimit(
  key: string,
  maxAttempts = 10,
  windowSeconds = 3600,
): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max_attempts: maxAttempts,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    // Fail open — don't block legitimate users if rate limit RPC is unavailable
    log.error('rate_limit.check_failed', { reason: error.message })
    return true
  }
  return data === true
}

export async function checkUserRateLimit(
  userId: string,
  action: string,
  maxAttempts = 100,
  windowSeconds = 3600,
): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('check_user_rate_limit', {
    p_user_id: userId,
    p_action: action,
    p_limit: maxAttempts,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    // Fail open — don't block legitimate users if rate limit RPC is unavailable
    log.error('rate_limit.user_check_failed', { reason: error.message })
    return true
  }
  return data === true
}
