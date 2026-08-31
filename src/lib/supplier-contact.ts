import { wazeSearchLink } from '@/lib/waze'
import { isIsraeliMobile, normalizeIsraeliPhone, waChatLink } from '@/lib/whatsapp'

/**
 * One view model for "how do I reach this business", shared by the product page
 * and the voucher page.
 *
 * WHY IT IS SHARED. `docs/BUSINESS-MODEL.md` §2 makes address + Waze and phone +
 * WhatsApp mandatory on EVERY product page, and the voucher page needs the same
 * three links after the sale. They were built once, inline, on the voucher page:
 * the address was plain text with no Waze link at all despite `GO-LIVE.md:72`
 * recording "Waze/WhatsApp sit on the voucher page", and the WhatsApp href was
 * `wa.me/${whatsapp.replace(/[^0-9]/g, '')}`. That strip keeps the leading zero
 * of a local number, and `https://wa.me/0524635550` is not a dead-ish link, it is
 * WhatsApp's "the phone number shared via link is not on WhatsApp" screen -- in
 * front of a customer standing at the till. Every href now goes through
 * `waChatLink`, which normalises to international digits first.
 */

export interface SupplierContactRow {
  name?: string | null
  city?: string | null
  address?: string | null
  contact_phone?: string | null
  whatsapp?: string | null
}

export interface SupplierContactView {
  name: string | null
  city: string | null
  /** Address and city joined for display, or null when neither is filled. */
  addressLine: string | null
  /** Navigation, only when a street address exists. See `waze.ts`. */
  wazeHref: string | null
  /** The number as the supplier typed it: Israelis read 03-1234567, not 97231234567. */
  phoneDisplay: string | null
  telHref: string | null
  whatsappHref: string | null
  /** True when there is at least one thing to render. */
  hasAny: boolean
}

/**
 * WHICH NUMBER GETS THE WHATSAPP LINK. `docs/PRODUCT-PAGE-SPEC.md` says the
 * WhatsApp field "falls back to contact_phone". Measured against production, an
 * unconditional fallback would be wrong for every supplier that has data: all
 * five filled rows hold a LANDLINE in `contact_phone` (03-1234567, 04-7654321,
 * 09-1112222, 08-5556666, 02-3334444) and a separate mobile in `whatsapp`.
 * Landlines have no WhatsApp account, so the fallback would have produced five
 * links that open WhatsApp only to say the number is not on it. It therefore
 * applies to mobiles only, which is the case the spec was actually describing.
 */
export function buildSupplierContact(
  supplier: SupplierContactRow | null | undefined,
  options: { whatsappMessage?: string } = {},
): SupplierContactView {
  const empty: SupplierContactView = {
    name: null,
    city: null,
    addressLine: null,
    wazeHref: null,
    phoneDisplay: null,
    telHref: null,
    whatsappHref: null,
    hasAny: false,
  }
  if (!supplier) return empty

  const name = trimmed(supplier.name)
  const city = trimmed(supplier.city)
  const address = trimmed(supplier.address)
  const phone = trimmed(supplier.contact_phone)

  const addressLine = [address, city].filter(Boolean).join(', ') || null

  // `tel:` gets the international form: a phone dialled from a roaming handset
  // resolves 0 against the visited network, not against Israel.
  const telIntl = normalizeIsraeliPhone(phone)

  const whatsappSource =
    trimmed(supplier.whatsapp) ?? (phone && isIsraeliMobile(phone) ? phone : null)

  const view: SupplierContactView = {
    name,
    city,
    addressLine,
    wazeHref: wazeSearchLink(address, city),
    phoneDisplay: phone,
    telHref: telIntl ? `tel:+${telIntl}` : null,
    whatsappHref: whatsappSource ? waChatLink(whatsappSource, options.whatsappMessage) : null,
    hasAny: false,
  }

  view.hasAny = Boolean(view.name || view.addressLine || view.telHref || view.whatsappHref)
  return view
}

function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text ? text : null
}

/**
 * Whether this product offers a WhatsApp link, read off a row that may not have
 * the column.
 *
 * `products.whatsapp_enabled` arrives with
 * `migrations/pending/123_products_whatsapp_enabled.sql`, which has NOT been
 * applied. `src/types/database.ts` is generated from production, so `Product`
 * genuinely does not carry the field and neither does the row at runtime.
 * Reading defensively states that; casting the row to a wider type would make
 * the compiler agree with a schema that does not exist.
 *
 * THE DEFAULT WHEN THE COLUMN IS ABSENT IS `false`, and that is the whole point
 * of the feature. Defaulting to true "until the migration lands" would switch
 * the button on for all 80 products at once, on behalf of eleven suppliers who
 * never agreed to answer WhatsApp -- which is precisely the state the column
 * exists to prevent. An unmigrated database therefore shows no button anywhere,
 * and that is correct, not degraded.
 *
 * Delete this and read the generated type directly once 123 is applied and the
 * types are regenerated.
 */
export function readWhatsAppEnabled(row: unknown): boolean {
  if (row === null || typeof row !== 'object') return false
  return (row as Record<string, unknown>).whatsapp_enabled === true
}
