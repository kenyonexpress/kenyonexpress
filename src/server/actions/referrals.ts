'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { normalizeReferralCode } from '@/lib/referrals/code'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { revalidatePath } from 'next/cache'

export type EnsureCodeState = { ok: boolean; code?: string; error?: string }

/**
 * Mints the SIGNED-IN user's referral code, and nobody else's.
 *
 * THIS ACTION IS THE FIX FOR A LIVE PERMISSION GAP, NOT JUST A BUTTON.
 *
 * `fn_ensure_referral_code(p_user_id uuid)` is SECURITY DEFINER and never looks
 * at `auth.uid()`: it takes the target entirely from its argument. 098 revoked
 * it from PUBLIC and anon but NOT from `authenticated`, so any signed-in
 * customer holding another customer's uuid could POST
 * `/rest/v1/rpc/fn_ensure_referral_code` and both read that person's code and,
 * if they had none, mint one for them. That is written up in STATE for
 * 2026-08-20 01:48 and `migrations/pending/143` carries the REVOKE.
 *
 * The shape that keeps it closed is the shape of this file:
 *
 *   - the uuid comes from `supabase.auth.getUser()` and from nowhere else. No
 *     parameter, no form field, nothing a caller can steer. There is no way to
 *     name a victim because there is no argument to name one with.
 *   - the RPC runs on `createAdminClient()`, i.e. as `service_role`, which 143
 *     leaves granted. So applying 143 does not break this action, and this
 *     action does not become a reason to leave 143 unapplied.
 *
 * That second point is the one that has gone wrong here before: 143's own
 * justification for another of its functions was "zero rpc() callsites in
 * src/", which was true of the website and false of the till app, and applying
 * it would have stopped every scanner in the field. Adding a caller to a
 * function a pending migration revokes is therefore not free. It has to be
 * classified, and `src/__tests__/revoked-functions-have-no-callers.test.ts`
 * fails until somebody does it by name.
 */
async function runEnsureMyReferralCode(): Promise<EnsureCodeState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'צריך להתחבר כדי לקבל קוד הפניה.' }

  // Keyed on the user and not on the IP, because the only thing this action can
  // touch is that user's own row: the limit is here to bound the ten-attempt
  // mint loop against a held-down button, not to stop an attacker, who has
  // nothing to reach. `check_rate_limit` itself runs on the service key.
  const allowed = await checkRateLimit(`referral-code:${user.id}`, 10, 3600)
  if (!allowed) return { ok: false, error: 'יותר מדי בקשות. נסה שוב בעוד כמה דקות.' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc(
    'fn_ensure_referral_code' as never,
    { p_user_id: user.id } as never,
  )

  if (error) {
    log.warn('referrals.mint_failed', { reason: error.message })
    return { ok: false, error: 'יצירת הקוד נכשלה. נסה שוב.' }
  }

  // Validated on the way out, not trusted. The function can only return its own
  // alphabet, so a value that fails here means the column holds something no
  // version of 098 wrote, and putting it into a share link would produce a URL
  // that `fn_claim_referral` will answer `unknown_code` to for the rest of its
  // life. Better an error now than a link that quietly refers nobody.
  const code = normalizeReferralCode(typeof data === 'string' ? data : null)
  if (!code) {
    log.warn('referrals.mint_returned_unusable_code', { detail: 'not the 098 alphabet' })
    return { ok: false, error: 'יצירת הקוד נכשלה. נסה שוב.' }
  }

  revalidatePath('/account/referrals')
  return { ok: true, code }
}

export async function ensureMyReferralCode(): Promise<EnsureCodeState> {
  // The arrow is not noise. `auth-coverage.test.ts` walks the local call graph
  // to prove every exported action reaches a guard, and it finds callees by
  // looking for a CALL. Passing `runEnsureMyReferralCode` as a bare reference
  // hides the only edge that leads to `supabase.auth.getUser()`, and the action
  // is then reported as an unguarded network endpoint. Every other action in
  // this tree is written the same way for the same reason.
  return withActionContext('account.referral.ensure_code', () => runEnsureMyReferralCode())
}
