import { Button, Hr, Img, Link, Section, Text } from '@react-email/components'
import { Card, Emphasis, Field, INK, LINE, MUTED, Layout, styles } from './Layout.tsx'
import { couponUrl, formatAgorot, formatCouponCode, formatCouponDate, siteOrigin } from './format.ts'

/**
 * The confirmation for an order that issued coupons. This IS the coupon: it
 * carries the code, the QR, the deadline, where to use it and what is still
 * owed at the counter.
 *
 * THE QR IS AN ATTACHED IMAGE REFERENCED BY `cid:`, NOT A `data:` URI.
 * `src/lib/email/voucher-email.ts` chose to embed nothing at all, and its
 * reasoning about `data:` URIs is right — Gmail, Outlook and most corporate
 * filters strip them, leaving a broken-image icon where the coupon should be.
 * A `cid:` reference to a real attachment is the case those filters were built
 * to allow, and Resend exposes it as `content_id`. When the encoder fails or
 * the client strips the image anyway, `qrCid` is null and this template renders
 * the code and the link instead, which is exactly the old behaviour. Nothing
 * here depends on the image arriving.
 *
 * TWO DATES, AND ONLY ONE OF THEM IS A DEADLINE.
 *   `expiresAt` is the deadline, and it is what large type says. The DB CHECK
 *   `vouchers_expires_within_offer` makes it `min(rolling window, offer end)`,
 *   so it is the earlier of the two and the only one the counter will honour.
 *   `offerValidUntil` is the promotion's own end date. It is shown, quietly and
 *   only when it differs, because a customer who saw "המבצע בתוקף עד" on the
 *   product page needs to be able to reconcile the two dates without calling
 *   support. Showing the offer end as the deadline would promise a day the
 *   voucher will not survive to, and they would find that out at a till.
 *
 * BOTH AMOUNTS, IN THIS ORDER: what was paid on the site, then what is still
 * owed at the business. The second is the number they will be asked for, and a
 * coupon email that only says "you paid ₪22" sets up an argument at a counter.
 */

export interface CouponLine {
  id: string
  code: string
  productName: string | null
  supplierName: string | null
  supplierAddress: string | null
  supplierPhone: string | null
  /** Agorot. What the coupon is worth at the counter. */
  faceValueAgorot: number
  /** Agorot. What was already paid on the site. */
  couponPriceAgorot: number
  /** Agorot. What is still owed at the business. */
  remainingDueAgorot: number
  /** The binding deadline, ISO. */
  expiresAt: string
  /** The promotion's own end date, ISO. Shown only when it differs. */
  offerValidUntil: string | null
  /** Resend attachment content id for this coupon's QR, or null. */
  qrCid: string | null
}

export interface CustomerCouponOrderProps {
  siteUrl: string
  customerName: string | null
  orderRef: string
  vouchers: readonly CouponLine[]
}

export function CustomerCouponOrder(props: CustomerCouponOrderProps) {
  const site = siteOrigin(props.siteUrl)
  const count = props.vouchers.length

  return (
    <Layout
      siteUrl={site}
      heading={count === 1 ? 'הקופון שלך מוכן' : `${count} קופונים מוכנים`}
      preview={`הזמנה ${props.orderRef} · ${count === 1 ? 'קופון אחד מוכן לשימוש' : `${count} קופונים מוכנים לשימוש`}`}
    >
      <Text style={intro} dir="rtl">
        {props.customerName ? `שלום ${props.customerName},` : 'שלום,'}
      </Text>
      <Text style={intro} dir="rtl">
        {count === 1
          ? 'תודה על הרכישה. הקופון שלך מוכן לשימוש.'
          : `תודה על הרכישה. ${count} הקופונים שלך מוכנים לשימוש.`}
      </Text>

      {props.vouchers.map((voucher) => {
        const url = couponUrl(site, voucher.id)
        const code = formatCouponCode(voucher.code)
        // Only when the offer ends later than the coupon does. Equal dates are
        // the ordinary case and repeating them reads as a contradiction.
        const showOffer =
          voucher.offerValidUntil != null &&
          formatCouponDate(voucher.offerValidUntil) !== formatCouponDate(voucher.expiresAt)

        return (
          <Card key={voucher.id}>
            <Text style={productName} dir="rtl">
              {voucher.productName ?? 'קופון'}
            </Text>
            {voucher.supplierName ? (
              <Text style={supplierLine} dir="rtl">
                {voucher.supplierName}
              </Text>
            ) : null}

            {voucher.qrCid ? (
              <Section style={{ textAlign: 'center', margin: '14px 0 6px' }} dir="rtl">
                <Img
                  src={`cid:${voucher.qrCid}`}
                  width="180"
                  height="180"
                  alt={`קוד QR לקופון ${code}`}
                  style={{ border: `1px solid ${LINE}`, borderRadius: '12px', margin: '0 auto' }}
                />
              </Section>
            ) : null}

            <Section style={codeBox} dir="rtl">
              <Text style={codeLabel} dir="rtl">
                קוד הקופון
              </Text>
              {/* ltr on the code itself: it is Latin letters and digits, and a
                  Hebrew paragraph direction reverses the visual order of the
                  groups when a client is not sure what it is looking at. */}
              <Text style={codeValue} dir="ltr">
                {code}
              </Text>
            </Section>

            <Emphasis
              label="לתשלום בבית העסק"
              value={formatAgorot(voucher.remainingDueAgorot)}
            />

            <Field label="שולם באתר" value={formatAgorot(voucher.couponPriceAgorot)} />
            <Field label="שווי הקופון" value={formatAgorot(voucher.faceValueAgorot)} />
            <Field label="בתוקף עד" value={formatCouponDate(voucher.expiresAt)} />
            {showOffer ? (
              <Field
                label="תוקף המבצע"
                value={formatCouponDate(voucher.offerValidUntil)}
              />
            ) : null}

            {voucher.supplierAddress ? (
              <Field label="כתובת בית העסק" value={voucher.supplierAddress} />
            ) : null}
            {voucher.supplierPhone ? (
              <Field label="טלפון בית העסק" value={voucher.supplierPhone} />
            ) : null}

            <Section style={{ textAlign: 'center', margin: '14px 0 0' }} dir="rtl">
              <Button href={url} style={button}>
                הצגת הקופון
              </Button>
            </Section>
            <Text style={fallbackLink} dir="rtl">
              או פתחו את הקישור:{' '}
              <Link href={url} style={{ color: INK }} dir="ltr">
                {url}
              </Link>
            </Text>
          </Card>
        )
      })}

      <Hr style={{ borderColor: LINE, margin: '18px 0 8px' }} />
      <Text style={fineprint} dir="rtl">
        הציגו את הקוד או את ה-QR בבית העסק. אין צורך להדפיס. שמרו את המייל עד
        למימוש — הקופון תקף עד התאריך המצוין ולא ניתן להאריכו.
      </Text>
      <Text style={fineprint} dir="rtl">
        הזמנה {props.orderRef}
      </Text>
    </Layout>
  )
}

const intro = {
  color: INK,
  fontFamily: styles.fontStack,
  fontSize: '15px',
  lineHeight: '1.7',
  margin: '0 0 10px',
}

const productName = {
  color: INK,
  fontFamily: styles.fontStack,
  fontSize: '18px',
  fontWeight: 700,
  lineHeight: '1.4',
  margin: '0',
}

const supplierLine = {
  color: MUTED,
  fontFamily: styles.fontStack,
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '2px 0 0',
}

const codeBox = {
  backgroundColor: '#f6f6f4',
  borderRadius: '12px',
  margin: '0 0 12px',
  padding: '12px 14px',
  textAlign: 'center' as const,
}

const codeLabel = {
  color: MUTED,
  fontFamily: styles.fontStack,
  fontSize: '12px',
  lineHeight: '1.4',
  margin: '0 0 2px',
}

const codeValue = {
  color: INK,
  fontFamily: 'Menlo, Consolas, monospace',
  fontSize: '22px',
  fontWeight: 700,
  letterSpacing: '0.12em',
  lineHeight: '1.3',
  margin: '0',
}

const button = {
  backgroundColor: '#fed700',
  borderRadius: '999px',
  color: INK,
  display: 'inline-block',
  fontFamily: styles.fontStack,
  fontSize: '15px',
  fontWeight: 700,
  padding: '13px 30px',
  textDecoration: 'none',
}

const fallbackLink = {
  color: MUTED,
  fontFamily: styles.fontStack,
  fontSize: '11px',
  lineHeight: '1.6',
  margin: '8px 0 0',
  textAlign: 'center' as const,
  wordBreak: 'break-all' as const,
}

const fineprint = {
  color: MUTED,
  fontFamily: styles.fontStack,
  fontSize: '12px',
  lineHeight: '1.6',
  margin: '0 0 4px',
}
