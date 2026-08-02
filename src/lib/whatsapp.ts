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

/** The store's WhatsApp business number, from env. Null disables WhatsApp UI. */
export function storeWhatsAppNumber(): string | null {
  return normalizeIsraeliPhone(process.env.NEXT_PUBLIC_WHATSAPP_PHONE)
}

export function buildProductShareText(name: string, priceIls: number, url: string): string {
  const price = `₪${priceIls.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  return `מצאתי משהו שווה ב-KenyonExpress: ${name} ב-${price}\n${url}`
}

export function buildCouponShareText(input: {
  productName: string | null
  code: string
  collectAmountIls: number
  expiresAt: string
  siteUrl: string
}): string {
  const lines = ['קופון מ-KenyonExpress 🎁']
  if (input.productName) lines.push(input.productName)
  lines.push(`קוד: ${input.code}`)
  if (input.collectAmountIls > 0) {
    lines.push(
      `לתשלום בעסק במימוש: ₪${input.collectAmountIls.toLocaleString('he-IL', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    )
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
