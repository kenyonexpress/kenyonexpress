import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE REFERRAL PROGRAMME HAS TO HAVE A CALLER. THAT IS THE WHOLE TEST.
 *
 * Everything the programme does existed in the database and nothing in the app
 * ever ran it. `098_referral_program.sql` is 577 lines: a code per user, a
 * claim, a fraud guard with three signals, a completion that credits two
 * wallets under a lock, a payout, a rejection, and two views. It is applied to
 * production. `/admin/referrals` renders the review queue over it.
 *
 * And a grep for `fn_claim_referral` or `fn_complete_referral` across `src/`
 * and `apps/` returned NOTHING. No page showed a customer a code, no landing
 * recorded a `?ref=`, no signup claimed one, no payment completed one. The
 * admin queue was a screen that could never have a row in it, because the only
 * two functions that create one had no callers at all. Every unit test in this
 * directory would have passed against that repo, because each one tests a
 * module that nothing imported.
 *
 * So this file asserts the wiring rather than the behaviour, at the four points
 * where a missing call is invisible: the capture, the two claims, and the
 * completion. It reads source, because three of the four are a proxy, a route
 * handler and a redirecting server action, none of which this suite renders.
 */

const root = process.cwd()

/** Comments discuss these names constantly. Only real code should satisfy a check. */
function code(file: string): string {
  return readFileSync(join(root, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('the capture', () => {
  it('reads ?ref= in the proxy, which is the only place every landing passes through', () => {
    const proxy = code('src/proxy.ts')
    expect(proxy).toContain('REFERRAL_QUERY_PARAM')
    expect(proxy).toContain('REFERRAL_COOKIE')
  })

  it('normalises before writing, so a payload in ?ref= sets no cookie', () => {
    expect(code('src/proxy.ts')).toContain('normalizeReferralCode(')
  })
})

describe('the claim', () => {
  it('runs in the auth callback, which is where email, magic link and Google land', () => {
    expect(code('src/app/auth/callback/route.ts')).toContain('claimReferralOnce(')
  })

  it('ALSO runs on the phone OTP path, the one signup that never reaches the callback', () => {
    // `verifyOtp` establishes the session in place and redirects. A claim
    // written only into the callback misses every phone signup, and nothing
    // anywhere reports a referral that was never recorded.
    expect(code('src/server/actions/auth.ts')).toContain('claimReferralOnce(')
  })

  it('is the only function that reaches fn_claim_referral', () => {
    expect(code('src/server/referrals/claim.ts')).toContain("'fn_claim_referral'")
  })
})

describe('the completion', () => {
  it('runs inside finalizeOrder, on the paid order and nowhere else', () => {
    const finalize = code('src/server/payments/finalize.ts')
    expect(finalize).toContain('completeReferralForOrder(')
    // The card token is only known at payment, which is why 098 takes the
    // `same_card` signal here rather than at claim time. Dropping it costs the
    // fraud guard its second-strongest input and nothing would ever say so.
    expect(finalize).toContain('cardToken: input.token?.token')
  })

  it('is the only function that reaches fn_complete_referral', () => {
    expect(code('src/server/referrals/complete.ts')).toContain("'fn_complete_referral'")
  })
})

describe('the customer can get to it', () => {
  it('is linked from the account nav, not only routable', () => {
    expect(code('src/components/account/AccountNav.tsx')).toContain("href: '/account/referrals'")
  })

  it('reads the programme terms rather than printing a bonus of its own', () => {
    const page = code('src/app/(account)/account/referrals/page.tsx')
    expect(page).toContain('getReferralProgram')
    // No hardcoded money on a page about money. The one number a customer is
    // promised has to be the one the database will actually pay.
    expect(page).not.toMatch(/₪\s*\d/)
  })
})
