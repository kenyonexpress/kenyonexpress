import { REFERRAL_QUERY_PARAM, normalizeReferralCode } from '@/lib/referrals/code'

/**
 * The page's own URL with the sharer's code on it.
 *
 * ONE PARAMETER, THE ONE THE PROXY ALREADY READS. `?ref=` is what
 * `src/proxy.ts` turns into the `ke_ref` cookie on every landing, and that
 * cookie is what checkout snapshots onto the order. A second parameter for
 * "affiliate" would need a second cookie, a second reader and a second
 * snapshot, and the two would drift. The code itself is the same code either
 * way (`profiles.referral_code`), so one link serves both programmes and the
 * database decides which pays.
 *
 * Client-safe and pure: the share buttons are client components and build the
 * link at click time from `window.location.href`.
 */
export function attributedShareUrl(currentHref: string, code: string | null | undefined): string {
  const normalized = normalizeReferralCode(code)
  if (!normalized) return currentHref
  let url: URL
  try {
    url = new URL(currentHref)
  } catch {
    return currentHref
  }
  // A page reached through somebody else's link carries their code. The
  // person sharing now is the one doing the work, so theirs replaces it, the
  // same last-touch rule the proxy applies to the cookie.
  url.searchParams.set(REFERRAL_QUERY_PARAM, normalized)
  return url.toString()
}
