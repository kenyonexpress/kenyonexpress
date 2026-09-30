import { decideRecentAuth } from '@/lib/auth/recent-auth'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Reads the session's `amr` list and applies the pure policy. A read failure
 * is "not recent": for a payment-method change, failing open is the bug.
 */
export async function hasRecentAuth(supabase: SupabaseClient, now: number = Date.now()) {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return false
  // supabase-js types the list as `string[] | AMREntry[]`; only entries that
  // carry a timestamp can prove recency, the bare-string shape counts as none.
  const methods = (data.currentAuthenticationMethods ?? []).filter(
    (m): m is { method: string; timestamp: number } => typeof m === 'object' && m !== null,
  )
  return decideRecentAuth(methods, now).recent
}
