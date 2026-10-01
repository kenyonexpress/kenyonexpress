import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { REFERRAL_QUERY_PARAM, normalizeReferralCode } from '@/lib/referrals/code'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The public short link for a referral/affiliate code: /r/<8-char code>.
 *
 * Forwards to `/?ref=<code>`, the SAME place every other share link on the
 * site already points at (ReferralShareCard's default, useShareAttribution,
 * ProductShareRow). `src/proxy.ts` is the one and only reader that turns the
 * query parameter into the `ke_ref` cookie -- see share-url.ts's "ONE
 * PARAMETER" note -- so this route must not write the cookie itself. Doing so
 * would be a second, divergent capture point for the same code, which is
 * exactly the duplication that note argues against.
 *
 * No UTM here. `referralShareUrl()` in code.ts bakes in
 * `utm_campaign=referral_program`, which would mislabel a share from
 * /account/affiliate: ReferralShareCard serves both programmes over the same
 * code, and this route has no way to know which one sent a visitor here.
 *
 * RATE LIMITED for the reason /c/[code] is: anonymous, public and guessable,
 * if only by brute force across the 32^8 code space. A malformed code just
 * lands on the plain homepage, the same forgiving fallback /c/[code] uses for
 * a bad coupon code.
 */
async function handleGET(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await ctx.params
  const home = NextResponse.redirect(new URL('/', request.url))

  const code = normalizeReferralCode(decodeURIComponent(rawCode).replace(/\s+/g, ''))
  if (!code) return home

  const ip = await getClientIp()
  if (!(await checkRateLimit(`referral_link_visit:ip:${ip}`, 60, 3600))) {
    log.warn('referral_link.rate_limited', { ip })
    return home
  }

  const target = new URL('/', request.url)
  target.searchParams.set(REFERRAL_QUERY_PARAM, code)
  return NextResponse.redirect(target)
}

export const GET = withRequestLog('/r/[code]', handleGET)
