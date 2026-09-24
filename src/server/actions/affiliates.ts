'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { normalizeReferralCode } from '@/lib/referrals/code'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { recordUserSignals, requestSignals } from '@/server/affiliates/signals'
import { getReferralProgram } from '@/server/referrals/program'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export type JoinAffiliateState = { ok: boolean; error?: string }

/** Postgres: unique_violation. `affiliates.user_id` is UNIQUE. */
const UNIQUE_VIOLATION = '23505'

const joinSchema = z.object({
  channel: z.string().trim().max(300, 'עד 300 תווים').optional().default(''),
})

/**
 * Enrols the SIGNED-IN customer in the affiliate programme, and nobody else.
 *
 * THE SHAPE THAT KEEPS IT CLOSED is the one `ensureMyReferralCode` states:
 * the uuid comes from `supabase.auth.getUser()` and from nowhere else, and the
 * SECURITY DEFINER mint (`fn_ensure_referral_code`, revoked from
 * `authenticated` by pending 143) runs on the service key. That function is
 * already classified in `revoked-functions-have-no-callers.test.ts` for
 * `actions/referrals.ts`; this file is the second sanctioned caller and is
 * classified there too.
 *
 * ONE CODE FOR BOTH PROGRAMMES. The affiliate code IS the referral code. A
 * customer who already minted one keeps it; one who has not gets it minted
 * here. The share link is the same link either way, and which programme pays
 * for a given order is decided in the database and in
 * `lib/affiliates/commission.ts`, never by which page the link was copied from.
 *
 * THE ROW STARTS AT `pending_review`. Approval is the admin's decision on
 * /admin/affiliates, a console that has existed since 010 with nothing to
 * approve. Commission is earned only from an `approved` row
 * (`decideConversion`: affiliate_not_approved).
 *
 * The joiner's device and IP are fingerprinted into `referral_signals` here,
 * so a later purchase from the same browser under this code is flagged
 * (`same_device`) rather than paid.
 */
async function runJoinAffiliateProgram(
  _: JoinAffiliateState | null,
  formData: FormData,
): Promise<JoinAffiliateState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'צריך להתחבר כדי להצטרף לתוכנית השותפים.' }

  const parsed = joinSchema.safeParse({ channel: formData.get('channel') ?? '' })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  const allowed = await checkRateLimit(`affiliate-join:${user.id}`, 5, 3600)
  if (!allowed) return { ok: false, error: 'יותר מדי בקשות. נסו שוב בעוד כמה דקות.' }

  const admin = createAdminClient()
  const { data: minted, error: mintError } = await admin.rpc('fn_ensure_referral_code', {
    p_user_id: user.id,
  })
  if (mintError) {
    log.warn('affiliates.join_mint_failed', { reason: mintError.message })
    return { ok: false, error: 'יצירת הקוד נכשלה. נסו שוב.' }
  }
  const code = normalizeReferralCode(typeof minted === 'string' ? minted : null)
  if (!code) {
    log.warn('affiliates.join_unusable_code', { detail: 'not the 098 alphabet' })
    return { ok: false, error: 'יצירת הקוד נכשלה. נסו שוב.' }
  }

  const { error: insertError } = await admin.from('affiliates').insert({
    user_id: user.id,
    affiliate_code: code,
    status: 'pending_review',
    channel_description: parsed.data.channel || null,
  })
  if (insertError && insertError.code !== UNIQUE_VIOLATION) {
    log.warn('affiliates.join_insert_failed', { reason: insertError.message })
    return { ok: false, error: 'ההצטרפות נכשלה. נסו שוב.' }
  }

  const signals = await requestSignals()
  await recordUserSignals(admin, user.id, signals)

  log.info(insertError ? 'affiliates.join_already_enrolled' : 'affiliates.joined', {
    userId: user.id,
  })
  revalidatePath('/account/affiliate')
  revalidatePath('/admin/affiliates')
  return { ok: true }
}

export async function joinAffiliateProgram(
  _: JoinAffiliateState | null,
  formData: FormData,
): Promise<JoinAffiliateState> {
  return withActionContext('account.affiliate.join', () => runJoinAffiliateProgram(_, formData))
}

/**
 * The code the SIGNED-IN customer's share links should carry, or null.
 *
 * Called by the product page's share row after mount, only for a signed-in
 * visitor (the hook checks the session client-side first, so anonymous
 * traffic never reaches this). Returns the code only when a share can
 * actually earn something: the customer is an approved affiliate, or the
 * friend-referral programme is live. Otherwise the link stays clean rather
 * than carrying a parameter nothing will honour.
 *
 * Read-only. It never mints: a code is created on the two pages that ask for
 * one, never as a side effect of viewing a product.
 */
async function runGetMyShareCode(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('referral_code' as never)
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    log.warn('affiliates.share_code_read_failed', { reason: profileError.message })
    return null
  }
  const code = normalizeReferralCode(
    (profile as { referral_code?: string | null } | null)?.referral_code ?? null,
  )
  if (!code) return null

  const [{ data: affiliate }, program] = await Promise.all([
    supabase.from('affiliates').select('status').eq('user_id', user.id).maybeSingle(),
    getReferralProgram(),
  ])
  if (affiliate?.status === 'approved') return code
  if (program) return code
  return null
}

export async function getMyShareCode(): Promise<string | null> {
  return withActionContext('account.affiliate.share_code', () => runGetMyShareCode())
}
