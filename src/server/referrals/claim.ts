import { log } from '@/lib/observability/log'
import { normalizeReferralCode } from '@/lib/referrals/code'
import { REFERRAL_COOKIE } from '@/lib/referrals/cookie'
import { referralFingerprint } from '@/lib/referrals/fingerprint'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies, headers } from 'next/headers'

/**
 * Binds a brand-new account to the referral code that brought it here.
 *
 * WHERE THIS IS CALLED FROM, AND WHY THERE
 *
 * `/auth/callback` and the phone-OTP verify action, because between them they
 * are every way an account comes into existence here: email+password confirms
 * through the callback, so does the magic link, so does Google. The OTP path is
 * the one that never reaches the callback, since `verifyOtp` establishes the
 * session in place. Putting the claim at the signup FORM instead would have
 * missed three of the four, and putting it on the first authenticated page view
 * would have made a GET write a row.
 *
 * IT IS BEST-EFFORT, DELIBERATELY
 *
 * This runs between an exchanged auth code and a redirect. A referral program
 * that is unreachable must not turn a successful sign-in into an error screen,
 * exactly as `enqueueWelcomeOnce` next to it must not. Nothing here is on the
 * money path: `fn_claim_referral` writes a `pending` row and moves not one
 * agora. The credit happens later, on a paid order, in `fn_complete_referral`.
 *
 * IT IS ALSO SAFE TO CALL TWICE
 *
 * `referrals` has one row per referred person, ever, so a second call answers
 * `already_referred` rather than creating a second claim. The cookie is cleared
 * on any definite answer, so in practice there is no second call.
 */

/** The leftmost `x-forwarded-for` hop, matching `getClientIp` and `readScanContext`. */
async function clientIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || null
  return ip && ip.length > 0 ? ip : null
}

/**
 * @param userId the account that was just created or just signed in. Always
 *   from an established session. This function never takes a uuid off a form.
 * @param deviceId the guest-session cookie value, which is the closest thing
 *   this app has to "the same browser": it is minted once per browser by
 *   `src/proxy.ts` and lives thirty days. `fn_referral_fraud_signals` calls
 *   that match `same_device`, the strongest of its three signals. Pass null
 *   when it is not known rather than substituting something weaker.
 */
export async function claimReferralOnce(userId: string, deviceId: string | null): Promise<void> {
  try {
    const cookieStore = await cookies()
    const code = normalizeReferralCode(cookieStore.get(REFERRAL_COOKIE)?.value)
    if (!code) return

    const ip = await clientIp()
    const admin = createAdminClient()
    const { data, error } = await admin.rpc(
      'fn_claim_referral' as never,
      {
        p_referred_user_id: userId,
        p_code: code,
        p_device_hash: deviceId ? referralFingerprint('device', deviceId) : null,
        p_ip_hash: ip ? referralFingerprint('ip', ip) : null,
      } as never,
    )

    if (error) {
      // Kept, not cleared. This is the one branch where the answer is unknown
      // rather than settled, and the same reasoning the guest-cart merge uses
      // two lines away applies: a code thrown away on a database hiccup is a
      // referral nobody can ever reconstruct, whereas a code kept costs one
      // more attempt at the next sign-in.
      log.warn('referrals.claim_failed', { reason: error.message })
      return
    }

    const result = data as { ok?: boolean; reason?: string } | null
    // Every non-error outcome is final for this account: the program is off, the
    // code names nobody, it is their own code, or they are already referred.
    // None of them get better by trying again, so the cookie goes.
    cookieStore.delete(REFERRAL_COOKIE)
    if (result?.ok) {
      log.info('referrals.claimed', { userId })
    } else {
      log.info('referrals.claim_declined', { userId, reason: result?.reason ?? 'unknown' })
    }
  } catch (error) {
    // A sign-in must not fail because of this. Same contract as the welcome
    // mail queued alongside it.
    log.warn('referrals.claim_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}
