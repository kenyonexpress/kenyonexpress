import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * `card_verify_enabled` (migration 313, seeded false). Fails closed: the 1 ILS
 * authorize-and-void flow charges a real card, so any doubt means off.
 * FLAG_CARD_VERIFY_ENABLED=1 is the hard override.
 */
export async function cardVerifyEnabled(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const override = env.FLAG_CARD_VERIFY_ENABLED?.trim().toLowerCase()
  if (override === '1' || override === 'true') return true
  try {
    const { data, error } = await createAdminClient()
      .from('feature_flags')
      .select('bool_value')
      .eq('key', 'card_verify_enabled')
      .maybeSingle()
    if (error) return false
    return (data as { bool_value: boolean | null } | null)?.bool_value === true
  } catch {
    return false
  }
}
