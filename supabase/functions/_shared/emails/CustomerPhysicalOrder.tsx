import { Button, Hr, Section, Text } from '@react-email/components'
import { Card, Emphasis, Field, INK, LINE, MUTED, Layout, styles } from './Layout.tsx'
import { formatAddress, formatAgorot, siteOrigin } from './format.ts'
import type { PostalAddress } from './format.ts'

/**
 * The confirmation for an order with nothing to redeem: goods that will be
 * shipped.
 *
 * WHAT A CUSTOMER ACTUALLY OPENS THIS FOR. Not the receipt — their bank already
 * told them the amount. They open it to check that the address is right, and to
 * find out when the parcel comes. So the address is a block of its own, in
 * large type, above the money, with the words that let them act on it if it is
 * wrong.
 *
 * NO DELIVERY DATE IS PROMISED. Each supplier ships on its own schedule and
 * this project stores no per-supplier lead time, so any number here would be
 * invented. An invented date is worse than none: it is the thing they will
 * quote back when it slips.
 */

export interface PhysicalOrderLine {
  productName: string
  quantity: number
  /** Agorot. The line total as charged. */
  totalAgorot: number | null
}

export interface CustomerPhysicalOrderProps {
  siteUrl: string
  customerName: string | null
  orderId: string
  orderRef: string
  lines: readonly PhysicalOrderLine[]
  /** Agorot. What was charged. */
  totalAgorot: number | null
  shippingAddress: PostalAddress | null
  /** The name and phone the courier will call, from the chosen address. */
  recipientName?: string | null
  recipientPhone?: string | null
}

export function CustomerPhysicalOrder(props: CustomerPhysicalOrderProps) {
  const site = siteOrigin(props.siteUrl)
  const address = formatAddress(props.shippingAddress)

  return (
    <Layout
      siteUrl={site}
      heading="ההזמנה שלך התקבלה"
      preview={`הזמנה ${props.orderRef} · אישור הזמנה ופרטי משלוח`}
    >
      <Text style={intro} dir="rtl">
        {props.customerName ? `שלום ${props.customerName},` : 'שלום,'}
      </Text>
      <Text style={intro} dir="rtl">
        קיבלנו את ההזמנה שלך והיא הועברה לספקים לאריזה. נעדכן אתכם כשהיא תישלח.
      </Text>

      <Card>
        <Text style={cardTitle} dir="rtl">
          כתובת למשלוח
        </Text>
        {address ? (
          <>
            <Text style={addressText} dir="rtl">
              {address}
            </Text>
            {props.recipientName ? (
              <Text style={recipient} dir="rtl">
                {props.recipientName}
                {props.recipientPhone ? ` · ${props.recipientPhone}` : ''}
              </Text>
            ) : null}
            <Text style={addressNote} dir="rtl">
              הכתובת שגויה? השיבו למייל הזה בהקדם, לפני שההזמנה נארזת.
            </Text>
          </>
        ) : (
          <Text style={addressMissing} dir="rtl">
            לא נשמרה כתובת למשלוח בהזמנה. השיבו למייל הזה עם הכתובת ונשלים אותה.
          </Text>
        )}
      </Card>

      <Card>
        <Text style={cardTitle} dir="rtl">
          מה הזמנת
        </Text>
        {props.lines.map((line) => (
          <Section key={line.productName} style={lineRow} dir="rtl">
            <Text style={lineName} dir="rtl">
              {line.productName}
            </Text>
            <Text style={lineMeta} dir="rtl">
              {`כמות: ${line.quantity}`}
              {line.totalAgorot != null ? ` · ${formatAgorot(line.totalAgorot)}` : ''}
            </Text>
          </Section>
        ))}
      </Card>

      {props.totalAgorot != null ? (
        <Emphasis label="סך הכל שולם" value={formatAgorot(props.totalAgorot)} />
      ) : null}

      <Field label="מספר הזמנה" value={props.orderRef} />

      <Section style={{ textAlign: 'center', margin: '18px 0 4px' }} dir="rtl">
        <Button href={`${site}/account/orders/${props.orderId}`} style={button}>
          מעקב אחרי ההזמנה
        </Button>
      </Section>

      <Hr style={{ borderColor: LINE, margin: '18px 0 8px' }} />
      <Text style={fineprint} dir="rtl">
        זמן האספקה נקבע על ידי בית העסק ומשתנה בין הזמנות. תקבלו עדכון נוסף עם
        יציאת המשלוח.
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

const cardTitle = {
  color: INK,
  fontFamily: styles.fontStack,
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '0.02em',
  margin: '0 0 12px',
}

const addressText = {
  color: INK,
  fontFamily: styles.fontStack,
  fontSize: '17px',
  fontWeight: 700,
  lineHeight: '1.7',
  margin: '0',
}

const recipient = {
  color: INK,
  fontFamily: styles.fontStack,
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '4px 0 0',
}

const addressNote = {
  color: MUTED,
  fontFamily: styles.fontStack,
  fontSize: '12px',
  lineHeight: '1.6',
  margin: '10px 0 0',
}

const addressMissing = {
  color: '#b45309',
  fontFamily: styles.fontStack,
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: '1.6',
  margin: '0',
}

const lineRow = {
  borderTop: `1px solid ${LINE}`,
  margin: '0',
  padding: '10px 0 0',
}

const lineName = {
  color: INK,
  fontFamily: styles.fontStack,
  fontSize: '16px',
  fontWeight: 700,
  lineHeight: '1.4',
  margin: '0 0 2px',
}

const lineMeta = {
  color: MUTED,
  fontFamily: styles.fontStack,
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0 0 8px',
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
