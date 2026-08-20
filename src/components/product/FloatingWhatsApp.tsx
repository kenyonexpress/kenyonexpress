import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { type SupplierContactRow, buildSupplierContact } from '@/lib/supplier-contact'
import { buildSupplierInquiryText } from '@/lib/whatsapp'

/**
 * A floating WhatsApp button that reaches THE SUPPLIER, on the product page
 * only.
 *
 * NOT THE SAME BUTTON AS `shared/WhatsAppFloat`. That one is the store's own
 * number and sits on every page in the `(store)` layout. This one opens a chat
 * with the business behind this specific product, which is the question a
 * shopper actually has before buying a coupon: "do you have it in my size /
 * are you open on Friday". Two different recipients, so two different buttons,
 * and this one stacks ABOVE the store's rather than covering it.
 *
 * WHEN IT RENDERS NOTHING, WHICH IS MOST OF THE TIME TODAY:
 *
 *  - `enabled` is false. It is read off `products.whatsapp_enabled`, a column
 *    that arrives with an unapplied migration, and `readWhatsAppEnabled`
 *    defaults it to false. Defaulting the other way would switch this button
 *    on for every product at once on behalf of eleven suppliers who never
 *    agreed to answer WhatsApp.
 *  - The supplier has no WhatsApp number. `buildSupplierContact` only falls
 *    back from `whatsapp` to `contact_phone` when that phone is a MOBILE:
 *    every filled supplier row in production holds a landline there, and a
 *    landline link opens WhatsApp only to say the number is not on it.
 *
 * The href is built by `waChatLink` through that same helper, so the number is
 * normalised to `https://wa.me/972XXXXXXXXX` exactly once, in one place. The
 * bug it exists to prevent is `wa.me/0524635550`, which is a live-looking link
 * to WhatsApp's "not on WhatsApp" screen.
 */
export default function FloatingWhatsApp({
  supplier,
  productName,
  enabled,
}: {
  supplier: SupplierContactRow | null | undefined
  productName: string | null
  /** `readWhatsAppEnabled(product)`. False when the column is not there yet. */
  enabled: boolean
}) {
  if (!enabled) return null

  const { whatsappHref, name } = buildSupplierContact(supplier, {
    whatsappMessage: buildSupplierInquiryText(productName),
  })
  if (!whatsappHref) return null

  const label = name ? `שליחת הודעה ל${name} בוואטסאפ` : 'שליחת הודעה לספק בוואטסאפ'

  return (
    <a
      href={whatsappHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      // bottom-24, not bottom-5: the store's own float sits at bottom-5 with a
      // 56px body, and on a phone the sticky buy bar owns the very bottom of
      // the screen. 96px clears both.
      className="fixed bottom-24 end-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-whatsapp text-white shadow-lg shadow-black/20 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-whatsapp"
    >
      <WhatsAppIcon size={30} />
    </a>
  )
}
