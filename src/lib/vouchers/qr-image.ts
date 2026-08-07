import { buildRedeemUrl } from '@/lib/vouchers/scan-input'
import { headers } from 'next/headers'
import QRCode from 'qrcode'

/**
 * The only place a voucher QR image is produced.
 *
 * Server-only: it reads `next/headers` and runs the encoder. The pure half of
 * the decision, what string the QR carries, stays in `scan-input.ts` as
 * `buildRedeemUrl`, so it can be tested without a request.
 *
 * WHY THIS MODULE EXISTS. Four screens rendered a voucher QR and only one of
 * them encoded the right thing. `/coupon/[id]` encoded the redeem URL; the
 * checkout return page, the order detail page and the admin voucher page each
 * encoded the bare `KEV1.<body>.<mac>` payload. `scan-input.ts` already spells
 * out why that fails: a phone's built-in camera has no idea what a KEV1 string
 * is and offers to search the web for it, while a URL opens /redeem/[token] and
 * lands the cashier on the confirm screen. The in-app scanner accepts both, so
 * the bug was invisible whenever the counter happened to use /scan, and it
 * showed up only for a cashier pointing a plain camera at the confirmation page
 * a customer had just been charged for.
 *
 * The admin page renders the same URL deliberately. It exists to show what the
 * customer will present, and a diagnostic that encodes something else diagnoses
 * nothing.
 */

/**
 * Where a QR scanned on somebody else's phone should land.
 *
 * The configured public URL wins. The request host is the fallback so a coupon
 * opened against a dev server still produces a scannable link instead of one
 * pointing at production.
 */
export async function resolveVoucherOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'kenyonexpress.co.il'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/**
 * A data URL for the voucher's QR, or null.
 *
 * Null is a first-class answer and every caller renders the short code beside
 * the image for it: a QR that will not encode must not blank a page somebody
 * reached by paying, and the code is what gets typed in anyway when a screen
 * will not scan.
 */
export async function voucherQrDataUrl(
  qrPayload: string | null | undefined,
  options: { width?: number } = {},
): Promise<string | null> {
  if (!qrPayload) return null
  try {
    const url = buildRedeemUrl(await resolveVoucherOrigin(), qrPayload)
    return await QRCode.toDataURL(url, { margin: 1, width: options.width ?? 320 })
  } catch {
    return null
  }
}
