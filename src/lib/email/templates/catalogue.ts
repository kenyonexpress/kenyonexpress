import type { BuiltEmail } from '@/lib/email/voucher-email'
import { buildCashbackEarnedEmail } from './cashback-earned'
import { buildDeliveryConfirmationEmail } from './delivery-confirmation'
import { buildMagicLinkEmail } from './magic-link'
import { buildOrderConfirmationEmail } from './order-confirmation'
import { buildPasswordResetEmail } from './password-reset'
import { buildPriceDropEmail } from './price-drop'
import { buildShippingUpdateEmail } from './shipping-update'
import { buildWelcomeEmail } from './welcome'

/**
 * The eight customer-facing transactional templates, each with a sample that
 * renders, so one test can hold every one of them to the same rule: a full
 * responsive RTL document out of `../layout.ts`.
 *
 * THE SAMPLES ARE DELIBERATELY AWKWARD. A sample of `{ name: 'Test' }` renders
 * beautifully and proves nothing. Each one below carries what breaks an RTL
 * mail: a Hebrew name, an amount with agorot, a tracking number that has to
 * stay LTR inside a Hebrew sentence, a URL with a query string, and a null
 * where the builder has a fallback.
 *
 * NOT A TEST FIXTURE FOR THE BUILDERS' OWN TESTS. Those own their inputs; a
 * shared fixture would mean tightening one test changes what this list shows.
 */

export type EmailTemplateId =
  | 'order-confirmation'
  | 'shipping-update'
  | 'delivery-confirmation'
  | 'cashback-earned'
  | 'price-drop'
  | 'welcome'
  | 'password-reset'
  | 'magic-link'

export interface EmailTemplateEntry {
  id: EmailTemplateId
  /** What the mail is, in Hebrew. */
  labelHe: string
  /** The `notification_outbox` kind this renders, or null for an auth mail. */
  outboxKind: string | null
  /** A representative render. Throws if the builder declines the sample. */
  sample(siteUrl: string): BuiltEmail
}

const ORDER_ID = '79f488aa-549a-40dd-af80-eb66d886668f'

function must(built: BuiltEmail | null, id: EmailTemplateId): BuiltEmail {
  if (!built) throw new Error(`template ${id} rendered nothing for its sample`)
  return built
}

export const EMAIL_TEMPLATE_CATALOGUE: readonly EmailTemplateEntry[] = [
  {
    id: 'order-confirmation',
    labelHe: 'אישור הזמנה',
    outboxKind: 'order_paid',
    sample: (siteUrl) =>
      buildOrderConfirmationEmail({
        orderId: ORDER_ID,
        orderRef: '79F488AA',
        customerName: 'דנה כהן-Levy',
        totalAgorot: 81_750,
        itemCount: 3,
        siteUrl,
      }),
  },
  {
    id: 'shipping-update',
    labelHe: 'ההזמנה נשלחה',
    outboxKind: 'order_shipped',
    sample: (siteUrl) =>
      buildShippingUpdateEmail({
        orderId: ORDER_ID,
        orderRef: '79F488AA',
        customerName: 'דנה',
        itemCount: 2,
        fulfilledAt: '2026-10-01T09:30:00.000Z',
        shipments: [
          { carrier: 'דואר ישראל', trackingNumber: 'RR123456789IL' },
          { carrier: null, trackingNumber: 'X9-00042' },
        ],
        siteUrl,
      }),
  },
  {
    id: 'delivery-confirmation',
    labelHe: 'ההזמנה נמסרה',
    outboxKind: 'order_delivered',
    sample: (siteUrl) =>
      buildDeliveryConfirmationEmail({
        orderId: ORDER_ID,
        orderRef: null,
        customerName: null,
        itemCount: 2,
        deliveredAt: '2026-10-03T14:05:00.000Z',
        siteUrl,
      }),
  },
  {
    id: 'cashback-earned',
    labelHe: 'נכנס קאשבק',
    outboxKind: 'cashback_credited',
    sample: (siteUrl) =>
      must(
        buildCashbackEarnedEmail({ amountAgorot: 1_250, orderRef: '79F488AA', siteUrl }),
        'cashback-earned',
      ),
  },
  {
    id: 'price-drop',
    labelHe: 'ירידת מחיר',
    outboxKind: 'price_drop',
    sample: (siteUrl) =>
      must(
        buildPriceDropEmail({
          productName: 'מקרר Samsung RB34 שתי דלתות 340 ליטר נירוסטה',
          slug: 'samsung-rb34-340l',
          oldAgorot: 429_900,
          newAgorot: 389_000,
          unsubscribeUrl: `${siteUrl}/wishlist/unsubscribe?t=abc.def&u=1`,
          siteUrl,
        }),
        'price-drop',
      ),
  },
  {
    id: 'welcome',
    labelHe: 'ברוכים הבאים',
    outboxKind: 'welcome',
    sample: (siteUrl) => buildWelcomeEmail({ fullName: 'דנה', siteUrl }),
  },
  {
    id: 'password-reset',
    labelHe: 'איפוס סיסמה',
    outboxKind: null,
    sample: (siteUrl) =>
      buildPasswordResetEmail({
        actionLink: `${siteUrl}/auth/callback?token_hash=pkce_0123456789abcdef&type=recovery&next=%2Freset-password`,
      }),
  },
  {
    id: 'magic-link',
    labelHe: 'קישור כניסה',
    outboxKind: null,
    sample: (siteUrl) =>
      buildMagicLinkEmail({
        actionLink: `${siteUrl}/auth/callback?token_hash=pkce_0123456789abcdef&type=magiclink`,
        code: '482913',
      }),
  },
]
