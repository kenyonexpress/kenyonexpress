import { buildMagicLinkEmail } from './magic-link'
import { type BuiltNotification, type NotificationKind, buildNotification } from './notifications'
import { buildVoucherEmail } from './voucher-email'

/**
 * A sample payload for every mail this system can send, so somebody can LOOK
 * at them.
 *
 * WHY THIS IS WORTH A FILE
 *
 * There are seventeen builders here and every one of them writes raw HTML with
 * hand-placed RTL isolates and inline styles, because that is what mail clients
 * accept. They are covered by tests -- and every one of those tests asserts a
 * SUBSTRING. `toContain('שלום דנה')` proves the greeting is in the string. It
 * proves nothing about whether the layout holds, whether a Hebrew line wraps
 * against a number, whether a button is reachable, or whether the shekel sign
 * ends up on the wrong side of an amount.
 *
 * Nobody has looked at most of these. `/dev/emails` is where you look, and this
 * is the data behind it.
 *
 * THE PAYLOADS ARE DELIBERATELY AWKWARD
 *
 * A sample of `{ name: 'Test', amount: 100 }` renders beautifully and tells you
 * nothing. Every sample below carries the shapes that actually break an RTL
 * mail: a Hebrew name next to a Latin one, an amount with agorot, a long
 * product title that has to wrap, a tracking number that must stay LTR inside a
 * Hebrew sentence, and a null where the builder has a fallback.
 *
 * NOT A TEST FIXTURE, AND NOT SHARED WITH ONE. The unit tests own their inputs;
 * a shared fixture would mean tightening a test changes what the gallery shows,
 * and the gallery's job is to show what a customer would get.
 */

export interface EmailPreview {
  id: string
  /**
   * The `notification_outbox` kind this renders, or null for a mail that is not
   * an outbox row at all.
   *
   * SEPARATE FROM `id` since 2026-09-10, and the split is the point.
   * `referral_bonus_credited` branches on `role` and needs two samples, so `id`
   * stopped being one-to-one with the kind. The completeness check in
   * `previews.test.ts` reads THIS field, so a second variant of an existing
   * kind cannot look like an orphan and a genuinely missing kind cannot be
   * masked by a variant id that happens to start with the right prefix.
   */
  kind: NotificationKind | null
  /** What the mail is, in Hebrew, for the index page. */
  labelHe: string
  /** Who receives it. An operator alert is not a customer mail. */
  audience: 'customer' | 'supplier' | 'operator'
  build(siteUrl: string): BuiltNotification
}

const SITE = 'https://kenyonexpress.co.il'

/** Every payload goes through `buildNotification`, the same door the drain uses. */
function fromOutbox(
  kind: NotificationKind,
  labelHe: string,
  audience: EmailPreview['audience'],
  payload: Record<string, unknown>,
  /**
   * Only for a kind that needs more than one preview because its template
   * branches. Ids must stay unique, and `kind` alone stops being unique the
   * moment a second variant is listed.
   */
  variant?: string,
): EmailPreview {
  return {
    id: variant ? `${kind}:${variant}` : kind,
    kind,
    labelHe,
    audience,
    build(siteUrl) {
      const built = buildNotification(kind, payload, siteUrl)
      if (!built) throw new Error(`buildNotification returned null for ${kind}`)
      return built
    },
  }
}

const ORDER_REF = 'A1B2C3D4'
const LONG_TITLE = 'עיסוי משולב מפנק לגבר, 45 דקות, כולל שוקולד וקפה — סוויטה ספא בוטיק'

export const EMAIL_PREVIEWS: readonly EmailPreview[] = [
  fromOutbox('order_paid', 'הזמנה שולמה', 'customer', {
    order_id: '11111111-2222-3333-4444-555555555555',
    order_ref: ORDER_REF,
    customer_name: 'דנה כהן',
    item_count: 3,
    total_agorot: 34_990,
  }),
  fromOutbox('order_shipped', 'ההזמנה נשלחה', 'customer', {
    order_id: '11111111-2222-3333-4444-555555555555',
    order_ref: ORDER_REF,
    customer_name: 'דנה כהן',
    item_count: 2,
    fulfilled_at: '2026-09-09T09:00:00Z',
    // Two parcels, because a multi-supplier order is this platform's normal
    // case and one of the two carriers has no tracking URL. Both facts have to
    // be visible in the gallery or the layout is only ever seen in its easy
    // shape.
    shipments: [
      { carrier: 'דואר ישראל', tracking_number: 'RR123456789IL' },
      { carrier: 'HFD', tracking_number: '55512345' },
    ],
  }),
  fromOutbox('voucher_issued', 'שובר הונפק', 'customer', {
    order_id: '11111111-2222-3333-4444-555555555555',
    order_ref: ORDER_REF,
    customer_name: 'דנה כהן',
    product_name: LONG_TITLE,
    code: '12345678',
    expires_at: '2026-12-31T21:59:59Z',
    balance_due_agorot: 8_800,
  }),
  fromOutbox('voucher_gifted', 'שובר במתנה', 'customer', {
    recipient_name: 'יעל',
    sender_name: 'דנה כהן',
    product_name: 'ארוחת בוקר זוגית בקפה קפה',
    message: 'יום הולדת שמח! נתראה בקרוב.',
    token: 'gift-token-abc',
  }),
  fromOutbox('voucher_expiring', 'שובר עומד לפוג', 'customer', {
    customer_name: 'דנה כהן',
    product_name: 'טיפול פנים עמוק',
    code: '87654321',
    expires_at: '2026-09-16T21:59:59Z',
    days_left: 7,
  }),
  fromOutbox('voucher_redeemed', 'שובר מומש', 'customer', {
    customer_name: 'דנה כהן',
    product_name: 'עיסוי מפנק',
    code: '12345678',
    redeemed_at: '2026-09-09T12:30:00Z',
    supplier_name: 'סוויטה ספא בוטיק',
  }),
  // `refunded_agorot`, not `amount_agorot`: the builder returns NULL for a
  // payload without it, and the first version of this file got the field name
  // wrong and produced exactly that. Worth a line, because a null from
  // `buildNotification` is how a real mail silently does not get sent.
  fromOutbox('refund_completed', 'החזר בוצע', 'customer', {
    order_id: '11111111-2222-3333-4444-555555555555',
    order_ref: ORDER_REF,
    customer_name: 'דנה כהן',
    refunded_agorot: 34_990,
    // A cancellation fee, so the sample shows the line that only appears when
    // the customer got back less than they paid.
    cancellation_fee_agorot: 1_500,
    refunded_at: '2026-09-09T13:00:00Z',
  }),
  fromOutbox('cashback_credited', 'זיכוי לארנק', 'customer', {
    customer_name: 'דנה כהן',
    amount_agorot: 1_250,
    balance_agorot: 9_990,
    reason: 'cashback',
  }),
  // The pair matters in the gallery: `voucher_expiring` is the warning and this
  // is what happens when it is not acted on. Reviewing either alone hides the
  // fact that a customer can receive both about the same coupon.
  fromOutbox('voucher_expiry_credited', 'זיכוי על קופון שפג', 'customer', {
    voucher_id: '00000000-0000-0000-0000-0000000000ab',
    amount_agorot: 10_800,
    product_name: LONG_TITLE,
    supplier_name: 'מספרת רון',
    expires_at: '2026-09-09T20:59:59Z',
  }),
  // Both sides, because the template branches on `role` and reviewing one
  // hides the branch: the referrer's copy sent to the referred person would
  // tell somebody they invited themselves.
  fromOutbox(
    'referral_bonus_credited',
    'בונוס הפניה - הממליץ',
    'customer',
    { amount_agorot: 2_000, role: 'referrer' },
    'referrer',
  ),
  fromOutbox(
    'referral_bonus_credited',
    'בונוס הפניה - המצטרף',
    'customer',
    { amount_agorot: 1_000, role: 'referred' },
    'referred',
  ),
  fromOutbox('welcome', 'ברוכים הבאים', 'customer', {
    customer_name: 'דנה כהן',
  }),
  fromOutbox('price_drop', 'ירידת מחיר במשאלות', 'customer', {
    customer_name: 'דנה כהן',
    product_name: LONG_TITLE,
    product_slug: 'עיסוי-מפנק',
    saved_agorot: 19_900,
    now_agorot: 14_900,
  }),
  fromOutbox('back_in_stock', 'חזר למלאי', 'customer', {
    product_name: 'חיתולי פמפרס',
    product_slug: 'חיתולי-פמפרס',
  }),
  fromOutbox('supplier_sale', 'מכירה חדשה לספק', 'supplier', {
    supplier_name: 'סוויטה ספא בוטיק',
    order_ref: ORDER_REF,
    product_name: LONG_TITLE,
    quantity: 2,
    supplier_due_agorot: 14_000,
  }),
  fromOutbox('invoice_dead', 'מסמך מס נכשל', 'operator', {
    order_id: '11111111-2222-3333-4444-555555555555',
    order_ref: ORDER_REF,
    document_type: 'חשבונית מס/קבלה',
    reason: 'provider rejected (402)',
    attempts: 5,
  }),
  fromOutbox('low_stock', 'מלאי נמוך', 'operator', {
    // `product_id` is required: without it the builder returns null.
    product_id: '99999999-8888-7777-6666-555555555555',
    product_name: LONG_TITLE,
    slug: 'massage-45',
    available: 1,
    stock_quantity: 4,
    threshold: 3,
    supplier_name: 'סוויטה ספא בוטיק',
  }),
  fromOutbox('reconciliation_gap', 'פער בהתאמת תשלומים', 'operator', {
    // `critical` must be above zero or the builder returns null -- which is
    // correct: a reconciliation run with no critical findings has nothing to
    // page anybody about.
    critical: 2,
    day: '2026-09-08',
    rows: [
      { kind: 'missing_locally', transaction_id: '99887766', amount_agorot: 34_990 },
      { kind: 'amount_mismatch', transaction_id: '99887767', amount_agorot: 11_100 },
    ],
  }),
  fromOutbox('settlement_gap', 'פער בפיצול מול הספק', 'operator', {
    // The three rows below are PRODUCTION as measured on 2026-09-09, with the
    // ids shortened. Using them rather than invented numbers is what makes the
    // preview show what the mail will actually look like the first time it
    // fires: three lines whose percent and whose money are two different
    // answers on one row.
    critical: 3,
    day: '2026-09-09',
    rows: [
      {
        kind: 'percent_contradiction',
        orderItemId: '11129c4f',
        orderId: 'd3a5aa99',
        expectedAgorot: 180,
        actualAgorot: 90,
        platformPercent: 10,
      },
      {
        kind: 'percent_contradiction',
        orderItemId: '4ba29dc9',
        orderId: '79f488aa',
        expectedAgorot: 79_900,
        actualAgorot: 3995,
        platformPercent: 100,
      },
      {
        kind: 'journal_missing',
        orderItemId: 'ef81705d',
        orderId: '79f488aa',
        expectedAgorot: 1800,
        actualAgorot: null,
        platformPercent: 10,
      },
    ],
  }),
  {
    id: 'magic_link',
    // Sent by the auth action, not through the outbox, so there is no kind.
    kind: null,
    labelHe: 'קישור התחברות',
    audience: 'customer',
    build: (siteUrl) =>
      buildMagicLinkEmail({
        actionLink: `${siteUrl}/auth/callback?token=abc123`,
      }),
  },
  {
    id: 'voucher_pdf_mail',
    // Sent by `finalizeOrder`, not through the outbox.
    kind: null,
    labelHe: 'שובר עם ‏QR',
    audience: 'customer',
    build: (siteUrl) =>
      buildVoucherEmail({
        siteUrl,
        customerName: 'דנה כהן',
        orderId: '11111111-2222-3333-4444-555555555555',
        invoiceNumber: '2026-0042',
        vouchers: [
          {
            id: 'voucher-1',
            code: '12345678',
            productName: LONG_TITLE,
            supplierName: 'סוויטה ספא בוטיק',
            supplierAddress: 'הרצל 12, תל אביב',
            // Stored as it is in the database, which is the shape the supplier
            // page already renders and CLAUDE.md records as ugly. The gallery
            // shows what a customer gets, not a tidied version of it.
            supplierPhone: '972524635550',
            faceValueAgorot: 19_900,
            couponPriceAgorot: 11_100,
            remainingDueAgorot: 8_800,
            expiresAt: '2026-12-31T21:59:59Z',
          },
        ],
      }),
  },
]

export function findPreview(id: string): EmailPreview | undefined {
  return EMAIL_PREVIEWS.find((preview) => preview.id === id)
}

export const PREVIEW_SITE_URL = SITE
