import { agorot } from '@/lib/money'
import { shekelsPlain } from '@/lib/money-format'
import { couponMoneyView, couponStatusView, formatCouponCode } from '@/lib/vouchers/coupon-view'
import { OFF_PAGE, offPageRgb } from '@/styles/tokens'

/**
 * What a voucher looks like inside Apple Wallet and inside Google Wallet.
 *
 * Pure, and deliberately so: this is where every rule about what a customer
 * sees on a lock screen lives, and none of it needs a certificate to be true.
 * The signing and the HTTP live next door and are the parts that cannot be
 * exercised on a machine without Apple and Google credentials.
 *
 * THE ONE RULE THAT IS NOT COSMETIC: the barcode message is `qr_payload`,
 * byte for byte the same string the coupon page renders. The scan endpoints
 * verify an HMAC over it (`KEV1.<body>.<mac>`), so a pass that carried the
 * short code, or a URL, or a re-encoding of the payload would scan as an
 * unknown voucher at the counter with the customer standing there. There is one
 * payload per voucher and both surfaces show it.
 *
 * Hebrew and RTL: `pass.json` has no direction field. Apple lays out by the
 * device locale, and a value that mixes a Hebrew label with an LTR number
 * reorders on its own. So money and dates are formatted with the same
 * `coupon-view` helpers the web page uses, and the code is grouped the same way
 * for reading aloud — one implementation, three surfaces.
 */

export interface WalletVoucher {
  id: string
  code: string
  qr_payload: string
  status: string
  face_value_agorot: number
  coupon_price_agorot: number
  remaining_amount_due_agorot: number
  expires_at: string
  issued_at: string
  product: { name_he: string | null } | null
  supplier: {
    name: string | null
    address?: string | null
    city?: string | null
    contact_phone?: string | null
  } | null
}

export interface ApplePassOptions {
  passTypeIdentifier: string
  teamIdentifier: string
  organizationName: string
  /** Absolute origin, for the "open the coupon page" link on the back. */
  origin: string
}

/**
 * The pass background, as the `rgb(r, g, b)` string PassKit requires.
 *
 * THE COMMENT HERE USED TO SAY "the brand red the whole site is measured
 * against", and that was backwards. The site measures #dc3545 on 456 elements
 * of `refs/ke_live_computed.json`; #E4002B is the 2026 brief's red and appears
 * in the reference zero times. Both facts are recorded on `OFF_PAGE.brandRed`,
 * which is where the value now lives -- a wallet pass is not scored by any
 * pixel gate, so it is the one surface where the brief's red is the right one.
 *
 * Written twice before, once as rgb() for Apple and once as hex for Google,
 * with nothing keeping the two in step.
 */
const BRAND_RGB = offPageRgb(OFF_PAGE.brandRed)

function agorotToText(value: number): string {
  return shekelsPlain(agorot(value))
}

function hebrewDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * `pass.json` for a coupon.
 *
 * `storeCard` and not `coupon`: Apple's `coupon` style is a single strip image
 * with one primary field, which suits "20% off" and not a voucher that has to
 * show a face value, what was paid online and what is still due at the counter.
 * Those three numbers ARE the product here — a customer who reads only the
 * price they paid arrives expecting to owe nothing.
 */
export function buildApplePass(
  voucher: WalletVoucher,
  options: ApplePassOptions,
): Record<string, unknown> {
  const money = couponMoneyView(voucher)
  const supplierName = voucher.supplier?.name ?? ''
  const productName = voucher.product?.name_he ?? 'שובר'
  const address = [voucher.supplier?.address, voucher.supplier?.city].filter(Boolean).join(', ')

  const backFields: Record<string, unknown>[] = [
    {
      key: 'code',
      label: 'קוד השובר',
      value: formatCouponCode(voucher.code),
    },
    {
      key: 'faceValue',
      label: 'מחיר מלא',
      value: agorotToText(money.faceValueAgorot),
    },
    {
      key: 'terms',
      label: 'תנאי מימוש',
      value: 'הציגו את הקוד או את ה-QR בבית העסק. השובר חד פעמי ופג בתאריך הנקוב.',
    },
    {
      key: 'link',
      label: 'הקופון באתר',
      value: `${options.origin}/coupon/${voucher.id}`,
    },
  ]
  if (address) backFields.splice(2, 0, { key: 'address', label: 'כתובת', value: address })
  if (voucher.supplier?.contact_phone) {
    backFields.splice(2, 0, {
      key: 'phone',
      label: 'טלפון',
      value: voucher.supplier.contact_phone,
    })
  }

  return {
    formatVersion: 1,
    passTypeIdentifier: options.passTypeIdentifier,
    teamIdentifier: options.teamIdentifier,
    organizationName: options.organizationName,
    // Per voucher, not per customer: this is the key Wallet uses to REPLACE an
    // existing pass rather than add a second one, so two downloads of the same
    // coupon must collapse into one card.
    serialNumber: voucher.id,
    description: `שובר ${productName}`,
    logoText: supplierName || options.organizationName,
    foregroundColor: offPageRgb(OFF_PAGE.paper),
    backgroundColor: BRAND_RGB,
    labelColor: offPageRgb(OFF_PAGE.paper),
    // iOS retires the card on its own once this passes, which is why the
    // nightly expiry sweep pushes nothing to Apple.
    expirationDate: new Date(voucher.expires_at).toISOString(),
    // Apple greys out a voided pass and stops surfacing it on the lock screen.
    // Derived from the clock and not from the column, for the reason
    // `coupon-view` documents: the expiry sweep is a cron, so a lapsed voucher
    // sits at `issued` until it runs.
    voided: !couponStatusView(voucher).presentable,
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: voucher.qr_payload,
        messageEncoding: 'iso-8859-1',
        altText: formatCouponCode(voucher.code),
      },
    ],
    storeCard: {
      headerFields: [
        {
          key: 'due',
          label: 'לתשלום בבית העסק',
          value: agorotToText(money.dueAtBusinessAgorot),
        },
      ],
      primaryFields: [
        {
          key: 'product',
          label: supplierName,
          value: productName,
        },
      ],
      secondaryFields: [
        {
          key: 'paid',
          label: 'שולם באתר',
          value: agorotToText(money.paidOnlineAgorot),
        },
        {
          key: 'expires',
          label: 'בתוקף עד',
          value: hebrewDate(voucher.expires_at),
        },
      ],
      auxiliaryFields: [],
      backFields,
    },
  }
}

export interface GooglePassOptions {
  issuerId: string
  classSuffix: string
  origin: string
}

/** `<issuerId>.<suffix>`, the class every voucher object points at. */
export function googleClassId(
  options: Pick<GooglePassOptions, 'issuerId' | 'classSuffix'>,
): string {
  return `${options.issuerId}.${options.classSuffix}`
}

/**
 * The object id, keyed on the voucher CODE and not on its UUID.
 *
 * Both are unique (`vouchers_code_key`, verified against production), so either
 * would name the object. The code is used because it is the only identifier the
 * REDEMPTION path has: `redeem_voucher` is called with a short code, resolved
 * from the QR payload's `c` field, and its result carries a code back. Keying
 * on the UUID would mean a `vouchers` lookup inside the counter's scan just to
 * learn which wallet object to expire — a query on the one path in this project
 * that has a person waiting at a till.
 *
 * Normalised rather than trusted: Google accepts `[a-zA-Z0-9._-]` only, and an
 * id outside that set is refused at save time as a link that simply errors.
 */
export function googleObjectId(issuerId: string, voucherCode: string): string {
  return `${issuerId}.${voucherCode.replace(/[^a-zA-Z0-9._-]/g, '')}`
}

/**
 * The `GenericObject` for a voucher.
 *
 * Generic and not `OfferObject`: an Offer is modelled around a redeemable
 * discount code issued by a merchant, and it has no place to put "paid online"
 * against "due at the counter". The same reason the Apple side is a storeCard.
 *
 * `state` is what push updates change. ACTIVE disappears from the customer's
 * pass list the moment the counter scans it, which is the behaviour a cashier
 * expects when they hand the phone back.
 */
export function buildGooglePass(
  voucher: WalletVoucher,
  options: GooglePassOptions,
): Record<string, unknown> {
  const money = couponMoneyView(voucher)
  const status = couponStatusView(voucher)
  const supplierName = voucher.supplier?.name ?? ''
  const productName = voucher.product?.name_he ?? 'שובר'

  return {
    id: googleObjectId(options.issuerId, voucher.code),
    classId: googleClassId(options),
    // EXPIRED covers redeemed, refunded, cancelled and lapsed alike. Google has
    // no "spent" state, and the alternative (leaving it ACTIVE) puts a dead
    // voucher back on the customer's lock screen near the shop.
    state: status.presentable ? 'ACTIVE' : 'EXPIRED',
    hexBackgroundColor: OFF_PAGE.brandRed,
    cardTitle: text(supplierName || 'KenyonExpress'),
    header: text(productName),
    subheader: text('לתשלום בבית העסק'),
    barcode: {
      type: 'QR_CODE',
      value: voucher.qr_payload,
      alternateText: formatCouponCode(voucher.code),
    },
    textModulesData: [
      { id: 'due', header: 'לתשלום בבית העסק', body: agorotToText(money.dueAtBusinessAgorot) },
      { id: 'paid', header: 'שולם באתר', body: agorotToText(money.paidOnlineAgorot) },
      { id: 'face', header: 'מחיר מלא', body: agorotToText(money.faceValueAgorot) },
      { id: 'expires', header: 'בתוקף עד', body: hebrewDate(voucher.expires_at) },
    ],
    linksModuleData: {
      uris: [{ uri: `${options.origin}/coupon/${voucher.id}`, description: 'הקופון באתר' }],
    },
    validTimeInterval: { end: { date: new Date(voucher.expires_at).toISOString() } },
  }
}

/** Google's localized-string envelope. `iw` is its (legacy) tag for Hebrew. */
function text(value: string): Record<string, unknown> {
  return {
    defaultValue: { language: 'iw', value },
  }
}
