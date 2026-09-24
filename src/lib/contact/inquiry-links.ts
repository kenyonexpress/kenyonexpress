import { t } from '@/lib/i18n/messages'
import {
  type OrderInquiryDetails,
  buildOrderInquiryText,
  storeWhatsAppNumber,
  waChatLink,
} from '@/lib/whatsapp'

/**
 * The two "ask us about THIS" buttons: a question about a product, and a
 * question about an order. Both open a wa.me chat the customer starts by
 * clicking; nothing here sends a message. WhatsApp and email are the only
 * contact channels the site offers, so there is no phone link.
 */

/** wa.me link to the store with a prefilled question about one product. */
export function productQuestionLink(productName: string, pageUrl?: string): string | null {
  const number = storeWhatsAppNumber()
  if (!number) return null
  const opener = t('contact.productQuestionMessage').replace('{name}', productName)
  return waChatLink(number, pageUrl ? `${opener}\n${pageUrl}` : opener)
}

/**
 * wa.me link to the store with a prefilled question about one order: the short
 * id, and when the caller has them, the item names and the amount paid.
 */
export function orderContactLink(orderId: string, details?: OrderInquiryDetails): string | null {
  const number = storeWhatsAppNumber()
  if (!number) return null
  return waChatLink(number, buildOrderInquiryText(orderId.slice(0, 8).toUpperCase(), details))
}
