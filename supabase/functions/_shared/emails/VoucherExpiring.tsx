import { Button, Hr, Section, Text } from '@react-email/components'
import { Card, Emphasis, Field, INK, LINE, MUTED, Layout, styles } from './Layout.tsx'
import {
  couponUrl,
  formatAgorot,
  formatCouponCode,
  formatCouponDate,
  formatDaysRemaining,
  siteOrigin,
} from './format.ts'

/**
 * The reminder that a coupon is about to lapse.
 *
 * WHY IT LEADS WITH THE DEADLINE AND NOT WITH THE BRAND. This is the one email
 * in the set whose entire job is to make somebody act this week. The heading is
 * the number of days, the first card is the coupon, and the button is the
 * coupon page. Everything else is below the fold on purpose.
 *
 * WHAT IT MUST NOT DO IS NAG. The sweep queues one reminder per voucher per
 * bucket and the dedupe key carries the bucket, so a customer gets this once at
 * three days out and never twice for the same coupon. `114`'s enqueue function
 * is the gate; this template has no idea how many have gone before it, which is
 * exactly why it must not imply one ("שוב מזכירים לך" would be a lie the
 * template is not in a position to tell).
 *
 * The balance still owed at the counter is here for the same reason it is in
 * the issue email: it is the number that decides whether the trip is worth it,
 * and finding it out at the till is the bad version.
 */

export interface VoucherExpiringProps {
  siteUrl: string
  customerName: string | null
  voucherId: string
  code: string
  productName: string | null
  supplierName: string | null
  supplierAddress: string | null
  supplierPhone: string | null
  /** The binding deadline, ISO. See CustomerCouponOrder on the two dates. */
  expiresAt: string
  daysRemaining: number
  /** Agorot, still owed at the business. Null when unknown. */
  remainingDueAgorot: number | null
}

export function VoucherExpiring(props: VoucherExpiringProps) {
  const site = siteOrigin(props.siteUrl)
  const url = couponUrl(site, props.voucherId)
  const code = formatCouponCode(props.code)
  // `formatDaysRemaining` already carries the plural, so the heading is one
  // template for every bucket: "פג מחר", "פג בעוד יומיים", "פג בעוד 3 ימים".
  const heading = `הקופון שלך פג ${formatDaysRemaining(props.daysRemaining)}`

  return (
    <Layout
      siteUrl={site}
      heading={heading}
      preview={`${props.productName ?? 'הקופון שלך'} · בתוקף עד ${formatCouponDate(props.expiresAt)}`}
    >
      <Text style={intro} dir="rtl">
        {props.customerName ? `שלום ${props.customerName},` : 'שלום,'}
      </Text>
      <Text style={intro} dir="rtl">
        רק שלא יישכח: הקופון הבא עדיין ממתין למימוש.
      </Text>

      <Emphasis label="בתוקף עד" value={formatCouponDate(props.expiresAt)} />

      <Card>
        <Text style={productName} dir="rtl">
          {props.productName ?? 'קופון'}
        </Text>
        {props.supplierName ? (
          <Text style={supplierLine} dir="rtl">
            {props.supplierName}
          </Text>
        ) : null}

        <Section style={codeBox} dir="rtl">
          <Text style={codeLabel} dir="rtl">
            קוד הקופון
          </Text>
          <Text style={codeValue} dir="ltr">
            {code}
          </Text>
        </Section>

        {props.remainingDueAgorot != null ? (
          <Field label="לתשלום בבית העסק" value={formatAgorot(props.remainingDueAgorot)} />
        ) : null}
        {props.supplierAddress ? (
          <Field label="כתובת בית העסק" value={props.supplierAddress} />
        ) : null}
        {props.supplierPhone ? (
          <Field label="טלפון בית העסק" value={props.supplierPhone} />
        ) : null}

        <Section style={{ textAlign: 'center', margin: '14px 0 0' }} dir="rtl">
          <Button href={url} style={button}>
            הצגת הקופון
          </Button>
        </Section>
      </Card>

      <Hr style={{ borderColor: LINE, margin: '18px 0 8px' }} />
      <Text style={fineprint} dir="rtl">
        לאחר התאריך המצוין לא ניתן לממש את הקופון ולא ניתן להאריך אותו.
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
  margin: '12px 0',
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

const fineprint = {
  color: MUTED,
  fontFamily: styles.fontStack,
  fontSize: '12px',
  lineHeight: '1.6',
  margin: '0',
}
