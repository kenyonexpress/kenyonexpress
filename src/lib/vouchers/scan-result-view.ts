import { formatAgorot } from '@/lib/vouchers/coupon-view'

/**
 * What the counter sees after a scan, as data rather than JSX.
 *
 * The scan screen is a client component and the phone holding it is behind a
 * counter with a customer waiting, so the decisions that matter -- how much to
 * collect, whether to collect at all, why a voucher was refused -- are made
 * here where they can be tested, not inside the render.
 *
 * THE ONE SAFETY PROPERTY: `payAtBusinessAgorot` is non-null ONLY on a
 * successful redemption. Every failure returns null, so there is no path where
 * a refused scan still shows a cashier an amount to take from a customer. That
 * is enforced by a test, because "already redeemed" and "collect 80" appearing
 * on the same screen is money taken twice for one voucher.
 *
 * Authoritative document: ARCHITECTURE-VOUCHER-REDEMPTION.md section 6.
 */

/** Mirrors public.voucher_scan_outcome plus the transport-level refusals. */
export type ScanResultOutcome =
  | 'success'
  | 'already_redeemed'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'not_found'
  | 'wrong_supplier'
  | 'unauthorized'
  | 'rate_limited'
  | 'invalid_request'
  | 'invalid_signature'

export interface ScanResultInput {
  outcome: string
  /** Set on success (the redemption just made) and on already_redeemed (the original). */
  redeemedAt?: string | null
  expiresAt?: string | null
  faceValueAgorot?: number | null
  couponPriceAgorot?: number | null
  remainingAmountDueAgorot?: number | null
  /** The idempotent replay of an earlier successful redemption. */
  replayed?: boolean
}

export interface ScanResultRow {
  label: string
  value: string
}

export interface ScanResultView {
  tone: 'success' | 'failure'
  /** Rendered in the largest type on the screen. */
  headline: string
  /**
   * The amount the business must now collect from the customer. NON-NULL ONLY
   * ON SUCCESS. Null means: show no amount, take no money.
   */
  payAtBusinessAgorot: number | null
  payLabel: string
  /** Why the scan was refused, with the time it happened when that is known. */
  reason: string | null
  rows: ScanResultRow[]
}

/**
 * Date AND time, unlike `formatCouponDate` which is date-only.
 *
 * The time is the whole point on a refusal: a customer whose voucher was
 * redeemed four minutes ago at the till next door is a different conversation
 * from one redeemed last Tuesday, and a date alone cannot tell them apart.
 */
export function formatCouponDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const day = date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}

const FAILURE_HEADLINE: Record<string, string> = {
  already_redeemed: 'השובר כבר מומש',
  expired: 'השובר פג תוקף',
  cancelled: 'השובר בוטל',
  refunded: 'השובר זוכה',
  not_found: 'שובר לא נמצא',
  // Collapsed to not_found by the API before it reaches a scanner; kept so this
  // module is total and so the audit-log path can render the honest version.
  wrong_supplier: 'השובר שייך לעסק אחר',
  unauthorized: 'אין הרשאה לסרוק',
  rate_limited: 'יותר מדי סריקות, המתינו רגע',
  invalid_request: 'בקשה לא תקינה',
  invalid_signature: 'קוד QR לא תקין',
}

/**
 * Builds the counter's result screen.
 *
 * `remainingAmountDueAgorot` is the coupon's balance: face value minus what the
 * customer already paid on this site. It is the number the business collects,
 * and on the screen it is the largest thing there.
 */
export function buildScanResultView(input: ScanResultInput): ScanResultView {
  const {
    outcome,
    redeemedAt = null,
    expiresAt = null,
    faceValueAgorot = null,
    couponPriceAgorot = null,
    remainingAmountDueAgorot = null,
    replayed = false,
  } = input

  if (outcome === 'success') {
    return {
      tone: 'success',
      headline: replayed ? 'השובר כבר מומש בסריקה זו' : 'השובר מומש בהצלחה',
      payAtBusinessAgorot: remainingAmountDueAgorot,
      payLabel: 'לגבות מהלקוח',
      reason: null,
      rows: [
        { label: 'שולם באתר', value: formatAgorot(couponPriceAgorot) },
        { label: 'שווי מלא', value: formatAgorot(faceValueAgorot) },
        { label: 'מומש ב', value: formatCouponDateTime(redeemedAt) },
      ],
    }
  }

  const headline = FAILURE_HEADLINE[outcome] ?? 'הסריקה נכשלה'

  // Every failure hands back a null amount. See the safety property above.
  const view: ScanResultView = {
    tone: 'failure',
    headline,
    payAtBusinessAgorot: null,
    payLabel: '',
    reason: null,
    rows: [],
  }

  if (outcome === 'already_redeemed') {
    view.reason = `השובר מומש כבר בתאריך ${formatCouponDateTime(redeemedAt)}. אין לספק את השירות ואין לגבות תשלום.`
    view.rows = [{ label: 'מומש במקור', value: formatCouponDateTime(redeemedAt) }]
    return view
  }

  if (outcome === 'expired') {
    view.reason = expiresAt
      ? `תוקף השובר פג בתאריך ${formatCouponDateTime(expiresAt)}.`
      : 'תוקף השובר פג.'
    view.rows = expiresAt ? [{ label: 'פג בתאריך', value: formatCouponDateTime(expiresAt) }] : []
    return view
  }

  if (outcome === 'refunded') {
    view.reason = 'השובר זוכה ללקוח. הכסף הוחזר, ואין לספק את השירות.'
    return view
  }

  if (outcome === 'cancelled') {
    view.reason = 'השובר בוטל ואינו ניתן למימוש.'
    return view
  }

  if (outcome === 'not_found') {
    // Deliberately says nothing about whether the code exists elsewhere: this
    // is also the answer a scanner from another business gets, and the two must
    // be indistinguishable or a supplier could probe another supplier's codes.
    view.reason = 'לא נמצא שובר תואם. ודאו את הקוד מול מסך הלקוח.'
    return view
  }

  view.reason = headline
  return view
}
