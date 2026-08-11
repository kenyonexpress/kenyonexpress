import { log } from '@/lib/observability/log'
import { readGoogleWalletConfig } from './config'
import { pushGoogleObjectState } from './google-wallet'
import { googleObjectId } from './pass-model'

/**
 * Moving a saved pass out of the customer's active list when the voucher stops
 * being usable.
 *
 * THERE ARE TWO CASES AND ONLY ONE OF THEM NEEDS A SERVER
 *
 * EXPIRY needs no push on either platform, and this is the part worth writing
 * down because building one would have looked like progress. Both formats carry
 * the deadline inside the pass — Apple's `expirationDate`, Google's
 * `validTimeInterval.end`, both set from `expires_at` when the pass is built —
 * and both clients retire the card on their own when it passes. Wiring the
 * nightly expiry sweep to push would have meant a per-voucher round trip to
 * Google every night to tell it something it already knew.
 *
 * REDEMPTION is the case that does need one, and only for Google. A saved
 * object keeps the `state` it was created with until the API says otherwise, so
 * a coupon scanned at the counter on day one stays ACTIVE on the lock screen for
 * the rest of its validity and resurfaces every time the customer walks past the
 * shop. That is what this function fixes, with nothing but the issuer service
 * account.
 *
 * On Apple the same case is NOT covered: `voided` is baked into the archive at
 * download time, and changing it needs the pass web service — device
 * registration endpoints, a table of registrations, and an APNs push under the
 * same Pass Type ID certificate.
 *
 * That web service is NOT built. It is named here rather than left as a gap:
 * with an Apple pass saved, a redeemed-but-not-yet-expired voucher stays
 * un-greyed on iOS until its deadline. The QR itself is harmless — the counter
 * refuses a burned voucher at the database, which is where single use has always
 * been decided, and never on the strength of what the phone displays.
 *
 * NEVER THROWS. Every caller runs after the voucher has already been burned or
 * swept; there is nothing useful they could do with a failure, and a redemption
 * that fails because Google was unreachable is a customer stuck at a till.
 */

export async function expireWalletPasses(
  voucherCodes: readonly string[],
): Promise<{ pushed: number; failed: number; skipped: number }> {
  const config = readGoogleWalletConfig()
  const summary = { pushed: 0, failed: 0, skipped: 0 }
  if (voucherCodes.length === 0) return summary

  for (const code of voucherCodes) {
    // `pushGoogleObjectState` already swallows its own failures. This catch is
    // not redundant belt-and-braces: it is what makes "never throws" a property
    // of THIS function rather than a property borrowed from another file that a
    // later change could take away silently, at a call site inside a redemption.
    let result: Awaited<ReturnType<typeof pushGoogleObjectState>>
    try {
      result = await pushGoogleObjectState(
        googleObjectId(config?.issuerId ?? '', code),
        { state: 'EXPIRED' },
        config,
      )
    } catch (error) {
      result = { outcome: 'failed', reason: error instanceof Error ? error.message : 'threw' }
    }

    if (result.outcome === 'ok') summary.pushed += 1
    else if (result.outcome === 'skipped') summary.skipped += 1
    else {
      summary.failed += 1
      // Named per voucher: "the wallet pass did not update" is otherwise a
      // report with no thread to pull, and the customer who notices is the one
      // standing in the shop.
      log.warn('wallet.push_failed', { voucher_code: code, reason: result.reason })
    }
  }

  return summary
}
