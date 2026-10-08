import { type HelpTopicId, isHelpTopicId } from '@/content/help/topics'
import { buildOrderInquiryText, storeWhatsAppLink } from '@/lib/whatsapp'

/**
 * Order-specific help (`/help?order=<id>`, STEP 50): the pure half.
 *
 * The page is static (`cacheComponents`), so the order id travels in the query
 * string and is read in the browser. Nothing here touches the database: the
 * links are built from the id alone, and every one of them lands on a route
 * that scopes to the signed-in customer itself (`getOrderDetail` 404s a foreign
 * id), so a guessed id in the URL buys nothing but a 404.
 */

/** The eight characters the customer sees as "מספר הזמנה" everywhere else. */
export function orderShortId(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase()
}

/**
 * An order id as it may appear in a URL or a form field: a UUID, or the short
 * form, with or without dashes. Anything else is not an id and is dropped
 * rather than echoed into the page or the mail.
 */
export function normalizeOrderRef(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > 64) return null
  return /^[0-9a-zA-Z-]{6,64}$/.test(trimmed) ? trimmed : null
}

export function helpUrlForOrder(orderId: string, topic: HelpTopicId = 'orders'): string {
  const params = new URLSearchParams({ order: orderId, topic })
  return `/help?${params.toString()}`
}

export interface HelpSearchState {
  orderRef: string | null
  topic: HelpTopicId | null
}

/** The two parameters `/help` understands, validated; anything else is ignored. */
export function parseHelpSearchParams(
  params: Pick<URLSearchParams, 'get'> | null | undefined,
): HelpSearchState {
  if (!params) return { orderRef: null, topic: null }
  const topic = params.get('topic')
  return {
    orderRef: normalizeOrderRef(params.get('order')),
    topic: isHelpTopicId(topic) ? topic : null,
  }
}

export interface OrderHelpLink {
  label: string
  href: string
  /** True for the WhatsApp link, which leaves the site. */
  external?: boolean
}

/**
 * Where a customer with a specific order can go from the help centre.
 *
 * The receipt and the return request only exist for a full id, so with a short
 * reference the list is the order list plus WhatsApp: a link that 404s is
 * worse than no link.
 */
export function orderHelpLinks(orderRef: string): OrderHelpLink[] {
  const isFullId = orderRef.length >= 32
  const links: OrderHelpLink[] = isFullId
    ? [
        { label: 'פרטי ההזמנה והקופונים', href: `/account/orders/${orderRef}` },
        { label: 'קבלה על התשלום', href: `/account/orders/${orderRef}/receipt` },
        { label: 'בקשת ביטול או החזרה', href: `/account/return/${orderRef}` },
      ]
    : [{ label: 'ההזמנות שלי', href: '/account/orders' }]

  const wa = storeWhatsAppLink(buildOrderInquiryText(orderShortId(orderRef)))
  if (wa) links.push({ label: 'שאלה על ההזמנה בוואטסאפ', href: wa, external: true })
  return links
}
