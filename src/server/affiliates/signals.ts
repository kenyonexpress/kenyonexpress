import { GUEST_SESSION_COOKIE, parseGuestSessionToken } from '@/lib/cart/guest-session'
import { log } from '@/lib/observability/log'
import { type SignalKind, referralFingerprint } from '@/lib/referrals/fingerprint'
import type { createAdminClient } from '@/lib/supabase/admin'
import { cookies, headers } from 'next/headers'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Writes a user's device / ip / card fingerprints into `referral_signals`.
 *
 * THE SAME TABLE THE FRIEND-REFERRAL GUARD READS, ON PURPOSE. 098's
 * `fn_referral_fraud_signals(a, b)` answers "do these two users look like one
 * person" from exactly these rows, and it is what the affiliate conversion
 * asks about the affiliate-buyer pair. Until now the table was only fed at a
 * referred signup, so an affiliate who was never referred and a buyer who was
 * not referred either had no rows to compare. This feeds it on the two
 * moments the affiliate programme can see a browser: the affiliate joining,
 * and a buyer checking out with a `ke_ref` cookie.
 *
 * Hashed through `referralFingerprint`, namespaced by kind, never raw. The
 * table has RLS with no policy, so only the service key reads it.
 *
 * Best-effort: a fingerprint that failed to write costs one fraud signal, not
 * a sign-in, a checkout or a payout.
 */
export interface UserSignals {
  deviceId?: string | null
  ip?: string | null
  cardToken?: string | null
}

export async function recordUserSignals(
  admin: AdminClient,
  userId: string,
  signals: UserSignals,
): Promise<void> {
  const rows: Array<{ user_id: string; kind: SignalKind; fingerprint: string }> = []
  if (signals.deviceId) {
    rows.push({
      user_id: userId,
      kind: 'device',
      fingerprint: referralFingerprint('device', signals.deviceId),
    })
  }
  if (signals.ip) {
    rows.push({ user_id: userId, kind: 'ip', fingerprint: referralFingerprint('ip', signals.ip) })
  }
  if (signals.cardToken) {
    rows.push({
      user_id: userId,
      kind: 'card',
      fingerprint: referralFingerprint('card', signals.cardToken),
    })
  }
  if (rows.length === 0) return

  // `referral_signals_unique (user_id, kind, fingerprint)` is the conflict
  // target. A repeat is not an error and is not re-counted here: the guard
  // compares equality, and `seen_count` is a curiosity it never reads.
  const { error } = await admin
    .from('referral_signals')
    .upsert(rows, { onConflict: 'user_id,kind,fingerprint', ignoreDuplicates: true })
  if (error) {
    log.warn('affiliates.signals_write_failed', { userId, reason: error.message })
  }
}

/**
 * The browser fingerprints of the CURRENT request: guest-session cookie and
 * the leftmost forwarded IP. Same sources `claimReferralOnce` and
 * `getClientIp` use, so a device seen at signup and the same device seen at
 * checkout hash to the same row.
 */
export async function requestSignals(): Promise<Pick<UserSignals, 'deviceId' | 'ip'>> {
  try {
    const [cookieStore, h] = await Promise.all([cookies(), headers()])
    const deviceId = parseGuestSessionToken(cookieStore.get(GUEST_SESSION_COOKIE)?.value)
    const forwarded = h.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || null
    return { deviceId, ip: ip && ip.length > 0 ? ip : null }
  } catch {
    return { deviceId: null, ip: null }
  }
}
