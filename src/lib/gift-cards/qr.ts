import 'server-only'

import { formatGiftCardCode, isWellFormedGiftCardCode } from '@/lib/gift-cards/code'
import { resolveVoucherOrigin, urlQrDataUrl } from '@/lib/vouchers/qr-image'

/**
 * A printable QR for a gift card: scanning it opens the redeem page with the
 * code already typed.
 *
 * THE CODE RIDES IN THE FRAGMENT, NEVER IN THE QUERY. A gift-card code is a
 * bearer secret: whoever holds it can load its value into a wallet. A
 * `?code=` would put it in the server's request log, in analytics, and in the
 * Referer of the first outbound click. The part of a URL after `#` is never
 * sent to a server at all, so the page reads it in the browser and nothing
 * else ever sees it.
 */

/** `https://site/gift-card#XXXX-XXXX-XXXX-XXXX`. Pure. */
export function giftCardRedeemUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/gift-card#${formatGiftCardCode(code)}`
}

/** A PNG data URL, or null for a malformed code or a QR that failed to draw. */
export async function giftCardQrDataUrl(code: string): Promise<string | null> {
  if (!isWellFormedGiftCardCode(code)) return null
  // Through `urlQrDataUrl`: lib/vouchers/qr-image.ts is the one place the
  // encoder is called from, and it already never throws.
  return urlQrDataUrl(giftCardRedeemUrl(await resolveVoucherOrigin(), code), { width: 320 })
}
