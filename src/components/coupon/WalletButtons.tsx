import { readAppleWalletConfig, readGoogleWalletConfig } from '@/lib/wallet/config'
import { buildSaveUrl } from '@/lib/wallet/google-wallet'
import { type WalletVoucher, buildGooglePass } from '@/lib/wallet/pass-model'

/**
 * "Add to Apple Wallet" / "Save to Google Wallet", each rendered only where it
 * can actually work.
 *
 * A platform with no credentials renders NOTHING — not a disabled button, not a
 * button that answers 500. The customer has no way to tell a broken pass from a
 * broken coupon page, and the coupon page is the thing they need at the counter.
 *
 * Server component with two plain links, no client JavaScript: the Apple side
 * is a download and the Google side is a URL that is fully determined the moment
 * the page renders. Anything more would put a bundle on the one screen in this
 * project that is opened with a cashier waiting.
 *
 * Not rendered at all for a voucher that cannot be presented. A wallet card for
 * a spent coupon is worse than none: it lives on a lock screen long after the
 * page that would have explained itself is closed.
 */

interface Props {
  voucher: WalletVoucher
  presentable: boolean
}

/** Trailing slashes stripped: Google compares `origins` as an exact string. */
function origin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')
}

export default function WalletButtons({ voucher, presentable }: Props) {
  if (!presentable) return null

  const apple = readAppleWalletConfig()
  const google = readGoogleWalletConfig()
  if (!apple && !google) return null

  const site = origin()
  const saveUrl = google
    ? buildSaveUrl(
        buildGooglePass(voucher, {
          issuerId: google.issuerId,
          classSuffix: google.classSuffix,
          origin: site,
        }),
        google,
        // Derived from the voucher, never from the clock: two renders of this
        // page must produce one pass, and a page that changes on every request
        // cannot be cached either.
        { origin: site, issuedAt: new Date(voucher.issued_at) },
      )
    : null

  return (
    <div className="mt-5 flex flex-col gap-2">
      {apple && (
        <a
          href={`/api/wallet/apple/${voucher.id}`}
          className="flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
          data-testid="apple-wallet"
        >
          הוספה ל-Apple Wallet
        </a>
      )}
      {saveUrl && (
        <a
          href={saveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50"
          data-testid="google-wallet"
        >
          שמירה ב-Google Wallet
        </a>
      )}
      <p className="text-center text-xs text-gray-400">
        אותו QR בדיוק שמופיע כאן. גם אחרי השמירה, הדף הזה נשאר תקף.
      </p>
    </div>
  )
}
