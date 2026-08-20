import { Button, Hr, Section, Text } from '@react-email/components'
import { Card, Emphasis, Field, INK, LINE, MUTED, Layout, styles } from './Layout.tsx'
import { formatAddress, formatAgorot, siteOrigin } from './format.ts'
import type { PostalAddress } from './format.ts'

/**
 * What a business is sent the moment somebody buys from it.
 *
 * THIS EMAIL IS A PICKING SLIP, NOT AN ANNOUNCEMENT. The order it puts things
 * in is the order the person reading it will need them: what to pack, then who
 * it goes to, then where. The money is last and is stated as the supplier's own
 * share, never as the customer's total — a business quoting the customer's
 * total back at them is how a support ticket starts.
 *
 * WHY THE ADDRESS IS FETCHED AT SEND TIME AND NOT FROZEN IN THE QUEUE PAYLOAD.
 * Everything else in this project snapshots (`order_items` freezes its
 * percentages, `095` freezes its payloads) because those are facts about a
 * transaction that must not be rewritten later. A delivery address is not that
 * kind of fact: it is an instruction about the future, and if a customer
 * corrects it between the charge and the drain, the corrected one is the one
 * that gets the parcel to them.
 *
 * WHY A COUPON-ONLY SALE STILL GETS A MAIL, WITHOUT A SHIPPING BLOCK. A voucher
 * sale needs no packing and no address, and printing an empty "כתובת למשלוח"
 * heading over nothing invites somebody to go looking for it. The block is
 * present only when a physical line is.
 */

export interface SupplierOrderLine {
  productName: string
  quantity: number
  productType: 'coupon' | 'physical' | 'service' | string
  sku?: string | null
}

export interface SupplierNewOrderProps {
  siteUrl: string
  supplierName: string | null
  orderRef: string
  customerName: string | null
  customerPhone: string | null
  lines: readonly SupplierOrderLine[]
  /** The supplier's share of this order, in agorot. Never the order total. */
  amountAgorot: number | null
  /** Null for a coupon-only sale. */
  shippingAddress: PostalAddress | null
  /** Free-text the customer left at checkout. */
  notes?: string | null
}

const TYPE_LABEL: Record<string, string> = {
  physical: 'משלוח',
  coupon: 'קופון',
  service: 'שירות',
}

export function SupplierNewOrder(props: SupplierNewOrderProps) {
  const site = siteOrigin(props.siteUrl)
  const physical = props.lines.filter((line) => line.productType === 'physical')
  const address = physical.length > 0 ? formatAddress(props.shippingAddress) : ''
  const units = props.lines.reduce((sum, line) => sum + (line.quantity || 0), 0)

  return (
    <Layout
      siteUrl={site}
      heading={physical.length > 0 ? 'הזמנה חדשה למשלוח' : 'מכירה חדשה'}
      preview={`הזמנה ${props.orderRef} · ${units} פריטים`}
    >
      <Text style={intro} dir="rtl">
        {props.supplierName ? `שלום ${props.supplierName},` : 'שלום,'}
      </Text>
      <Text style={intro} dir="rtl">
        {physical.length > 0
          ? 'התקבלה הזמנה חדשה שממתינה לאריזה ומשלוח.'
          : 'התקבלה הזמנה חדשה.'}
      </Text>

      <Card>
        <Text style={cardTitle} dir="rtl">
          מה להכין
        </Text>
        {props.lines.map((line) => (
          <Section key={`${line.productName}-${line.sku ?? ''}`} style={lineRow} dir="rtl">
            <Text style={lineName} dir="rtl">
              {line.productName}
            </Text>
            <Text style={lineMeta} dir="rtl">
              {`כמות: ${line.quantity}`}
              {` · ${TYPE_LABEL[line.productType] ?? line.productType}`}
              {line.sku ? ` · מק"ט ${line.sku}` : ''}
            </Text>
          </Section>
        ))}
      </Card>

      <Card>
        <Text style={cardTitle} dir="rtl">
          פרטי ההזמנה
        </Text>
        <Field label="מספר הזמנה" value={props.orderRef} />
        <Field label="שם הלקוח" value={props.customerName ?? 'לא נמסר'} />
        {props.customerPhone ? <Field label="טלפון" value={props.customerPhone} /> : null}
        {props.notes ? <Field label="הערות הלקוח" value={props.notes} /> : null}
      </Card>

      {physical.length > 0 ? (
        <Card>
          <Text style={cardTitle} dir="rtl">
            כתובת למשלוח
          </Text>
          {address ? (
            <Text style={addressText} dir="rtl">
              {address}
            </Text>
          ) : (
            // A physical line with no address is a real state: the checkout
            // allows a pickup order, and an address row can be soft-deleted
            // between the charge and this mail. Saying so beats printing a
            // blank line the supplier reads as "no delivery needed".
            <Text style={addressMissing} dir="rtl">
              לא נמסרה כתובת למשלוח. יש ליצור קשר עם הלקוח לפני האריזה.
            </Text>
          )}
        </Card>
      ) : null}

      {props.amountAgorot != null ? (
        <Emphasis label="הסכום שלך בהזמנה הזו" value={formatAgorot(props.amountAgorot)} />
      ) : null}

      <Section style={{ textAlign: 'center', margin: '18px 0 4px' }} dir="rtl">
        <Button href={`${site}/supplier`} style={button}>
          פתיחת אזור הספקים
        </Button>
      </Section>

      <Hr style={{ borderColor: LINE, margin: '18px 0 8px' }} />
      <Text style={fineprint} dir="rtl">
        הסכום המוצג הוא חלקך בהזמנה לפי אחוזי החלוקה שנשמרו בעת הרכישה, לפני
        קיזוזים או החזרים.
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

const addressText = {
  color: INK,
  fontFamily: styles.fontStack,
  fontSize: '16px',
  fontWeight: 600,
  lineHeight: '1.7',
  margin: '0',
}

const addressMissing = {
  color: '#b45309',
  fontFamily: styles.fontStack,
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: '1.6',
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
