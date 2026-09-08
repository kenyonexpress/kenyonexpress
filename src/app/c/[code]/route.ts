import { CART_COUPON_COOKIE, couponCookieOptions } from '@/lib/cart/coupon-cookie'
import { isValidUnitCode } from '@/lib/coupons/unit-codes'
import { growthClient } from '@/lib/growth/client'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Where a printed coupon QR lands: /c/<8-digit code>.
 *
 * The whole job is to move the code from the flyer into the cart coupon
 * cookie and put the shopper on the homepage. The cookie holds the CODE and
 * nothing else; the cart re-resolves and re-prices it on every render and
 * again at the charge (see cart.ts), so nothing here decides what the code is
 * worth. That is also why this route can afford to be forgiving: a code that
 * fails any check just redirects home without a cookie, which renders as "no
 * coupon", the truthful state.
 *
 * RATE LIMITED because the route is anonymous, guessable and answers
 * differently for a real code than for a fake one (the cookie). 10^7 valid
 * codes against 30 tries an hour makes enumeration a non-starter; a genuine
 * shopper scans one flyer, not thirty.
 */

async function handleGET(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await ctx.params
  const home = NextResponse.redirect(new URL('/', request.url))

  // Same normalisation as a typed code: trim, strip inner spaces. A scanner
  // app that pads the URL or a shopper who copies it with whitespace still
  // lands on the code itself.
  const code = decodeURIComponent(rawCode).replace(/\s+/g, '')

  // The Luhn gate runs before the rate-limit spend on purpose: a mistyped
  // reprint or a corrupted scan burns nothing, only deliberate probing of
  // well-formed codes counts against the budget.
  if (!isValidUnitCode(code)) return home

  const ip = await getClientIp()
  if (!(await checkRateLimit(`coupon_qr_apply:ip:${ip}`, 30, 3600))) {
    log.warn('coupon_qr.rate_limited', { ip })
    return home
  }

  const { data: campaign } = await growthClient().campaigns().byUnitCode(code)
  if (!campaign) return home

  log.info('coupon_qr.applied', { campaignId: campaign.id })

  // Same attributes as the cart's own cookie writes in cart.ts, and now the
  // same OBJECT: "same attributes" was true of all three writers while all
  // three were missing `secure`. The cart will show the campaign's label the
  // moment anything priceable is in it.
  home.cookies.set(
    CART_COUPON_COOKIE,
    code,
    couponCookieOptions(request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol),
  )
  return home
}

export const GET = withRequestLog('/c/[code]', handleGET)
