import { render } from '@react-email/render'
import type { ReactElement } from 'react'
import { CustomerCouponOrder } from './CustomerCouponOrder.tsx'
import type { CustomerCouponOrderProps } from './CustomerCouponOrder.tsx'
import { CustomerPhysicalOrder } from './CustomerPhysicalOrder.tsx'
import type { CustomerPhysicalOrderProps } from './CustomerPhysicalOrder.tsx'
import { SupplierNewOrder } from './SupplierNewOrder.tsx'
import type { SupplierNewOrderProps } from './SupplierNewOrder.tsx'
import { VoucherExpiring } from './VoucherExpiring.tsx'
import type { VoucherExpiringProps } from './VoucherExpiring.tsx'
import { formatCouponDate, formatDaysRemaining } from './format.ts'

/**
 * The boundary between a template and a message.
 *
 * Everything above this file is a React component and knows nothing about
 * transports; everything below sends. These four functions are the only place
 * the two meet, which is what lets the whole template layer be tested by
 * rendering it, with no Resend, no database and no Deno.
 *
 * EVERY MAIL CARRIES A PLAIN-TEXT PART. It is not a formality: an email with no
 * text/plain alternative scores against the sending domain in every major spam
 * filter, and this project sends transactional mail from a domain whose
 * reputation is the reason coupons arrive at all. `render(..., { plainText })`
 * derives it from the same tree, so the two halves cannot say different things.
 *
 * THE SUBJECT LIVES HERE, NOT IN THE TEMPLATE. A subject is not part of the
 * document; it is part of the message. Keeping it beside the render call is
 * what lets a caller see, in one place, exactly what lands in an inbox.
 */

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

async function renderBoth(element: ReactElement, subject: string): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])
  return { subject, html, text }
}

export function supplierNewOrderSubject(props: SupplierNewOrderProps): string {
  const physical = props.lines.some((line) => line.productType === 'physical')
  return physical
    ? `הזמנה חדשה למשלוח · ${props.orderRef}`
    : `מכירה חדשה · הזמנה ${props.orderRef}`
}

export function renderSupplierNewOrder(props: SupplierNewOrderProps): Promise<RenderedEmail> {
  return renderBoth(SupplierNewOrder(props), supplierNewOrderSubject(props))
}

export function customerCouponOrderSubject(props: CustomerCouponOrderProps): string {
  const count = props.vouchers.length
  if (count === 1) {
    const name = props.vouchers[0]?.productName
    return name ? `הקופון שלך מוכן: ${name}` : 'הקופון שלך מוכן'
  }
  return `${count} קופונים מוכנים לך ב-KenyonExpress`
}

export function renderCustomerCouponOrder(
  props: CustomerCouponOrderProps,
): Promise<RenderedEmail> {
  return renderBoth(CustomerCouponOrder(props), customerCouponOrderSubject(props))
}

export function customerPhysicalOrderSubject(props: CustomerPhysicalOrderProps): string {
  return `אישור הזמנה ${props.orderRef} · KenyonExpress`
}

export function renderCustomerPhysicalOrder(
  props: CustomerPhysicalOrderProps,
): Promise<RenderedEmail> {
  return renderBoth(CustomerPhysicalOrder(props), customerPhysicalOrderSubject(props))
}

export function voucherExpiringSubject(props: VoucherExpiringProps): string {
  const when = formatDaysRemaining(props.daysRemaining)
  const name = props.productName ?? 'הקופון שלך'
  // The date is in the subject as well as the body. A reminder read in a
  // notification preview and never opened has still done its job if it says
  // when.
  return `${name} פג ${when} (${formatCouponDate(props.expiresAt)})`
}

export function renderVoucherExpiring(props: VoucherExpiringProps): Promise<RenderedEmail> {
  return renderBoth(VoucherExpiring(props), voucherExpiringSubject(props))
}
