import { log } from '@/lib/observability/log'
import { normalizeReferralCode } from '@/lib/referrals/code'
import { referralFingerprint } from '@/lib/referrals/fingerprint'
import { createAdminClient } from '@/lib/supabase/admin'

/** Postgres: undefined_table. A database without 252 has no clicks table. */
const UNDEFINED_TABLE = '42P01'

let warnedMissing = false

export interface AffiliateClickInput {
  /** The raw `?ref=` value; normalised here, a non-code records nothing. */
  code: string | null | undefined
  /** The pathname the share link pointed at. The query string is never stored. */
  pathname: string
  /** Leftmost forwarded IP, or null. Hashed before it is written. */
  ip: string | null
  /** The raw guest-session cookie, or null. Reduced to its uuid and hashed. */
  deviceToken: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * The uuid inside a guest cart token (`{uuid}` or `{uuid}.{sig}`), the same
 * reduction `parseGuestSessionToken` in lib/cart/guest-session.ts makes, so a
 * device seen here and the same device seen at checkout hash to one row.
 * Repeated rather than imported because that module imports `next/headers`,
 * which this file must not pull into the proxy bundle.
 */
export function deviceIdFromToken(raw: string | null | undefined): string | null {
  if (!raw) return null
  const uuid = raw.includes('.') ? (raw.split('.')[0] ?? '') : raw
  return UUID_RE.test(uuid) ? uuid : null
}

/**
 * Records one affiliate click: a landing that just set the `ke_ref` cookie.
 *
 * CALLED FROM THE PROXY, AFTER THE RESPONSE. `src/proxy.ts` is the one reader
 * that turns `?ref=` into the cookie (share-url.ts, "ONE PARAMETER"), so it
 * is also the one place a click is a fact rather than a guess, and it hands
 * this to `event.waitUntil` so the visitor's response never waits on it.
 *
 * ONE STATEMENT, NO LOOKUP. The row carries the code; the 252 trigger resolves
 * it to the affiliate, bumps `affiliates.total_clicks`, and drops the row
 * when the code is a plain friend-referral code that names no affiliate. The
 * proxy does not need to know which it was.
 *
 * BEST-EFFORT BY DESIGN. Nothing here can fail the visit: a missing table
 * (252 not applied) is logged once per process, any other error once per
 * click, and a thrown admin client (no service key in this environment) is
 * caught the same way. A lost click costs a number on a dashboard, not
 * money: commissions are paid on conversions, never on clicks.
 */
export async function recordAffiliateClick(input: AffiliateClickInput): Promise<void> {
  const code = normalizeReferralCode(input.code)
  if (!code) return
  const deviceId = deviceIdFromToken(input.deviceToken)
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('affiliate_clicks' as never).insert({
      code,
      landing_path: landingPath(input.pathname),
      ip_fingerprint: input.ip ? referralFingerprint('ip', input.ip) : null,
      device_fingerprint: deviceId ? referralFingerprint('device', deviceId) : null,
    } as never)
    if (!error) return
    if (error.code === UNDEFINED_TABLE) {
      if (!warnedMissing) {
        warnedMissing = true
        log.info('affiliates.clicks_table_missing', {
          detail:
            'affiliate_clicks absent: apply migrations/pending/252_affiliate_clicks_payouts.sql',
        })
      }
      return
    }
    log.warn('affiliates.click_write_failed', { reason: error.message })
  } catch (error) {
    log.warn('affiliates.click_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

/** A pathname the 252 CHECK accepts: leading slash, no query, bounded. */
export function landingPath(pathname: string): string {
  const path = pathname.split('?')[0] ?? '/'
  const slashed = path.startsWith('/') ? path : `/${path}`
  return slashed.length > 512 ? slashed.slice(0, 512) : slashed
}
