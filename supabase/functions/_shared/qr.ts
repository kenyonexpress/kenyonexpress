import QRCode from 'qrcode'
import { siteOrigin } from './emails/format.ts'

/**
 * The coupon QR, as bytes an email can attach.
 *
 * WHAT THE QR ENCODES IS A URL, NOT THE PAYLOAD. `src/lib/vouchers/qr-image.ts`
 * documents the bug this avoids and it is worth restating: a phone's built-in
 * camera has no idea what a `KEV1.<body>.<mac>` string is and offers to search
 * the web for it, while a URL opens `/redeem/<token>` and lands the cashier on
 * the confirm screen. Four screens in this project once encoded the bare
 * payload and only one encoded the URL. This encodes the URL, byte for byte the
 * same string `buildRedeemUrl` produces.
 *
 * NULL IS A FIRST-CLASS ANSWER, and every caller renders the short code beside
 * the image for it. A QR that will not encode must not stop a coupon email:
 * the code can always be typed, and the email carries it in large type anyway.
 * This is the same contract `voucherQrDataUrl` already has on the Next side.
 */

export interface VoucherQr {
  /** Base64 PNG, no `data:` prefix. Ready for a Resend attachment. */
  base64: string
  /** The `cid:` handle the HTML references. */
  contentId: string
  filename: string
}

/** Byte-identical to `buildRedeemUrl` in `src/lib/vouchers/scan-input.ts`. */
export function buildRedeemUrl(baseUrl: string, token: string): string {
  return `${siteOrigin(baseUrl)}/redeem/${encodeURIComponent(token)}`
}

export async function voucherQrAttachment(
  site: string,
  voucherId: string,
  qrPayload: string | null | undefined,
): Promise<VoucherQr | null> {
  if (!qrPayload) return null

  try {
    const url = buildRedeemUrl(site, qrPayload)
    // `toBuffer` is the only encoder path that produces a real PNG rather than
    // a `data:` URL, and a real PNG is what an attachment needs. It reaches
    // pngjs through Deno's node compatibility layer, which is exactly the sort
    // of thing that can stop working under a runtime upgrade — hence the
    // catch, and hence a caller that is fine without an image.
    const buffer = await QRCode.toBuffer(url, {
      type: 'png',
      margin: 1,
      width: 360,
      errorCorrectionLevel: 'M',
    })

    return {
      base64: base64FromBytes(new Uint8Array(buffer)),
      // Unique per voucher: two coupons in one email must not share a cid, or
      // the second `<img>` renders the first coupon's code.
      contentId: `qr-${voucherId}`,
      filename: `coupon-${voucherId}.png`,
    }
  } catch (error) {
    console.error('qr.encode_failed', voucherId, error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Bytes to base64 without `btoa(String.fromCharCode(...bytes))`.
 *
 * That idiom spreads the whole array into an argument list and throws
 * `RangeError: Maximum call stack size exceeded` somewhere north of 100KB — a
 * 360px QR is comfortably under it, which is exactly why the bug would ship and
 * then surface on the first larger image somebody attaches here.
 */
function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
