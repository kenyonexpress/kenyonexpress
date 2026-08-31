import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
/**
 * WhatsApp deep-link helpers (client-safe, no dependencies).
 *
 * Links use the official wa.me scheme:
 * - Contact a number:  https://wa.me/<intl-digits>?text=<encoded>
 * - Share (no target): https://wa.me/?text=<encoded>
 */

/**
 * Normalize an Israeli phone number to international wa.me digits.
 * Accepts "050-1234567", "0501234567", "+972501234567", "972501234567".
 * Returns digits like "972501234567", or null when the input is not a
 * valid Israeli mobile/landline number.
 */
export function normalizeIsraeliPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null

  // Already international: 972 + 8-9 digits (leading 0 stripped)
  if (digits.startsWith('972')) {
    const rest = digits.slice(3).replace(/^0/, '')
    return rest.length >= 8 && rest.length <= 9 ? `972${rest}` : null
  }
  // Local format: 0X-XXXXXXX / 05X-XXXXXXX
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 10) {
    return `972${digits.slice(1)}`
  }
  return null
}

/** True for Israeli mobile numbers (05X-XXXXXXX). */
export function isIsraeliMobile(raw: string | null | undefined): boolean {
  const intl = normalizeIsraeliPhone(raw)
  if (!intl) return false
  return intl.startsWith('9725') && intl.length === 12
}

/** Link that opens a chat with a specific number (already-normalized or raw Israeli). */
export function waChatLink(phone: string, text?: string): string | null {
  const intl = normalizeIsraeliPhone(phone) ?? (/^\d{10,15}$/.test(phone) ? phone : null)
  if (!intl) return null
  const query = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${intl}${query}`
}

/** Share sheet link: user picks the recipient in WhatsApp. */
export function waShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/**
 * The store's own WhatsApp number, as published by the live site.
 *
 * `KE_LIVE_SPEC.md` ("כפתור WhatsApp צף: מספר 972524635550") is the source, and
 * this exact string was already pasted into `SiteFooter.tsx` and into the
 * `/contact` page as a literal `https://wa.me/972524635550`. Three copies of one
 * number, and only one of them read the env var -- so on a deployment that never
 * set `NEXT_PUBLIC_WHATSAPP_PHONE`, the footer icon and the contact page kept
 * working while the floating button silently rendered nothing, which is the one
 * failure nobody would report. The constant is the default and the env var is an
 * override, not the other way round.
 */
export const PUBLISHED_STORE_WHATSAPP = '972524635550'

/** The store's WhatsApp business number: env override, else the published one. */
export function storeWhatsAppNumber(): string | null {
  return (
    normalizeIsraeliPhone(process.env.NEXT_PUBLIC_WHATSAPP_PHONE) ??
    normalizeIsraeliPhone(PUBLISHED_STORE_WHATSAPP)
  )
}

/**
 * International digits back to the local form an Israeli reads: 972524635550 ->
 * 052-463-5550. Printing the international form to a customer is technically
 * correct and reads as a foreign number.
 */
export function formatIsraeliPhoneDisplay(raw: string | null | undefined): string | null {
  const intl = normalizeIsraeliPhone(raw)
  if (!intl) return null
  const local = `0${intl.slice(3)}`
  // Mobile 05X-XXX-XXXX (10 digits); everything else 0X-XXXXXXX.
  return local.length === 10
    ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`
    : `${local.slice(0, 2)}-${local.slice(2)}`
}

/**
 * Chat link to the store's own number. Every place that talks to the shop --
 * the floating button, the footer icon, the contact page -- goes through here,
 * so the number cannot drift between them again.
 */
export function storeWhatsAppLink(text?: string): string | null {
  const phone = storeWhatsAppNumber()
  return phone ? waChatLink(phone, text) : null
}

/**
 * There is deliberately no product-share builder here.
 *
 * There was one, `buildProductShareText`, and it was wrong for exactly the case
 * the storefront cares about most: for a coupon it quoted `products.price_ils`,
 * the sticker price of the goods at the business, so a customer sharing an
 * ₪80 coupon sent their friend "₪200" and the friend landed on a page quoting
 * ₪80. It also baked the URL into the text, which every channel then appended
 * again. `src/lib/share/message.ts` replaced it and explains the pricing rule at
 * length; by the time it was removed here nothing imported this one.
 *
 * Kept as a comment rather than deleted silently, because the tempting thing to
 * do next is to write it back.
 */

export function buildCouponShareText(input: {
  productName: string | null
  code: string
  /**
   * What is still owed at the business, in integer AGOROT.
   *
   * This took shekels, which meant every caller had to divide a stored agorot
   * column by 100 first and hand over a float. `vouchers
   * .remaining_amount_due_agorot` is the only source there has ever been for
   * this number, so the division was pure loss: it converted an exact integer
   * into a value that has to be rounded back, in the one message a customer
   * forwards to someone else as a record of what they will pay.
   */
  collectAmountAgorot: number
  expiresAt: string
  siteUrl: string
}): string {
  const lines = ['קופון מ-KenyonExpress 🎁']
  if (input.productName) lines.push(input.productName)
  lines.push(`קוד: ${input.code}`)
  if (input.collectAmountAgorot > 0) {
    lines.push(`לתשלום בעסק במימוש: ${shekels(agorot(input.collectAmountAgorot))}`)
  }
  lines.push(
    `בתוקף עד ${new Date(input.expiresAt).toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })}`,
  )
  lines.push(input.siteUrl)
  return lines.join('\n')
}

/**
 * The message pre-filled when a shopper taps the supplier's WhatsApp from a
 * product page. It names the product, because a business that sells forty deals
 * cannot answer "היי, יש פרטים?".
 */
export function buildSupplierInquiryText(productName: string | null, url?: string): string {
  const subject = productName ? `על "${productName}"` : 'על דיל שראיתי'
  const lines = [`שלום, ראיתי ב-KenyonExpress ואשמח לפרטים ${subject}`]
  if (url) lines.push(url)
  return lines.join('\n')
}

/**
 * The message pre-filled when the holder of a voucher messages the business.
 *
 * It deliberately does NOT carry the voucher code. The code is what redeems the
 * coupon; a pre-filled message is one forward away from being somebody else's,
 * and the customer shows the code at the counter anyway.
 */
export function buildRedemptionInquiryText(productName: string | null): string {
  const subject = productName ? ` על "${productName}"` : ''
  return `שלום, יש לי קופון מ-KenyonExpress${subject} ואשמח לתאם מימוש`
}

export function buildOrderInquiryText(orderShortId: string): string {
  return `שלום, אשמח לעדכון על הזמנה ${orderShortId} שביצעתי באתר KenyonExpress`
}

export function buildOrderUpdateText(input: {
  customerName: string | null
  orderShortId: string
  statusLabel: string
}): string {
  const greeting = input.customerName ? `שלום ${input.customerName},` : 'שלום,'
  return `${greeting}\nעדכון מ-KenyonExpress על הזמנה ${input.orderShortId}: ${input.statusLabel}`
}
