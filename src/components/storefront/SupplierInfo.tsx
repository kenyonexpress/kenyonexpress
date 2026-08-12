import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { type SupplierContactRow, buildSupplierContact } from '@/lib/supplier-contact'
import { buildSupplierInquiryText } from '@/lib/whatsapp'
import { MapPin, Navigation, Phone } from 'lucide-react'

export type SupplierSummary = ({ id: string; name: string } & SupplierContactRow) | null

/**
 * Supplier details on EVERY product page (coupon, physical and subscription).
 *
 * WHAT CHANGED AND WHY. This block used to print the business name and nothing
 * else, with a comment claiming contact details "stay private".
 * `docs/BUSINESS-MODEL.md` §2 requires the opposite: address + Waze, phone +
 * WhatsApp are mandatory on every product page. The gap was not cosmetic. Fifteen
 * of the live products are coupons, redeemed in person at a counter, and until
 * now the address only appeared on `/coupon/[id]` -- AFTER paying. A shopper
 * deciding whether to buy could not see where the business is or ask it a
 * question. `GO-LIVE.md:72` recorded exactly that symptom.
 *
 * Every field is conditional, and that is the whole design: measured against
 * production, 11 of 11 suppliers have no address and 6 have no phone at all, so
 * an unconditional row would print "כתובת:" followed by nothing on most pages.
 * A missing field renders nothing; a present one renders a working link.
 */
/**
 * The enum members, spelled the way the database spells them.
 *
 * `recurring`, not `subscription`. The third type was named `recurring` by
 * PENDING-109 (`src/lib/commerce/recurring.ts` tests `row.type === 'recurring'`),
 * and this prop used to say `subscription` -- a string no product row ever
 * holds. Nothing failed loudly: the union simply never matched, so a monthly
 * subscription fell through to the physical branch below and told the customer
 * their subscription "נשלח ומסופק על ידי הספק". The compiler could not catch it
 * because `products.type` is still typed from unmigrated production, where the
 * member does not exist yet.
 */
export type SupplierInfoProductType = 'coupon' | 'physical' | 'service' | 'recurring'

/**
 * What "the supplier" means for this type, in one sentence, under the contact
 * details. A total rather than a ternary so that adding an enum member is a type
 * error here instead of a silently wrong sentence -- which is exactly how
 * `recurring` came to claim it gets shipped.
 *
 * `service` is a live enum member in production that no code path sets, so it
 * gets the honest neutral wording rather than a shipping promise.
 */
const FULFILMENT_NOTE: Record<SupplierInfoProductType, string> = {
  coupon: 'מימוש הקופון מתבצע ישירות מול הספק בבית העסק.',
  physical: 'המוצר נשלח ומסופק על ידי הספק.',
  service: 'השירות ניתן על ידי הספק.',
  recurring: 'המנוי מתחדש אוטומטית ומסופק על ידי הספק. אפשר לבטל בכל עת מהאזור האישי.',
}

export default function SupplierInfo({
  supplier,
  productType,
  productName,
  whatsappEnabled = false,
}: {
  supplier: SupplierSummary
  productType: SupplierInfoProductType
  productName?: string | null
  /**
   * The per-product opt-in from `products.whatsapp_enabled`. Defaults to false
   * so a caller that forgets it shows no button rather than opening a channel
   * the supplier never agreed to. See `readWhatsAppEnabled`.
   */
  whatsappEnabled?: boolean
}) {
  const contact = buildSupplierContact(supplier, {
    whatsappMessage: buildSupplierInquiryText(productName ?? null),
  })

  const showWhatsApp = whatsappEnabled && contact.whatsappHref !== null

  // `contact.hasAny` counts the WhatsApp link, which this component may be
  // suppressing. A supplier whose ONLY reachable detail is a WhatsApp number
  // that the admin has not opted in would otherwise render an empty <ul> under
  // the heading instead of the "details coming soon" line.
  const hasAnyVisible = Boolean(
    contact.name || contact.addressLine || contact.telHref || showWhatsApp || contact.logoUrl,
  )

  return (
    <section aria-label="פרטי ספק">
      <h2 className="pdp-details__title">פרטי הספק</h2>

      {hasAnyVisible ? (
        <ul className="pdp-details__list space-y-1.5">
          {(contact.logoUrl || contact.name) && (
            <li className="flex items-center gap-3">
              {contact.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- supplier CDN URLs vary; next/image needs a static allowlist
                <img
                  src={contact.logoUrl}
                  alt={contact.name ? `לוגו ${contact.name}` : 'לוגו הספק'}
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded object-contain"
                />
              )}
              {contact.name && (
                <span>
                  <span className="pdp-details__label">ספק: </span>
                  <span className="font-medium">{contact.name}</span>
                </span>
              )}
            </li>
          )}

          {contact.addressLine && (
            <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={15} aria-hidden="true" className="shrink-0" />
                <span className="font-medium">{contact.addressLine}</span>
              </span>
              {contact.wazeHref && (
                <a
                  href={contact.wazeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-link hover:underline"
                >
                  <Navigation size={14} aria-hidden="true" />
                  ניווט ב-Waze
                </a>
              )}
            </li>
          )}

          {contact.telHref && (
            <li className="flex items-center gap-1.5">
              <Phone size={15} aria-hidden="true" className="shrink-0" />
              {/* The number is dialled as typed but WRITTEN ltr: a Hebrew
                  paragraph would otherwise flip 03-1234567 to 1234567-03. */}
              <a href={contact.telHref} dir="ltr" className="font-medium text-link hover:underline">
                {contact.phoneDisplay}
              </a>
            </li>
          )}

          {/* Two conditions, and both are necessary. The flag is the supplier's
              consent; the href is whether there is a WhatsApp-capable number to
              send it to. Measured against production, all five filled
              `contact_phone` values are landlines, so the flag alone would
              render links that open WhatsApp only to say the number is not on
              it. See 003-products-whatsapp-enabled.sql. */}
          {showWhatsApp && contact.whatsappHref && (
            <li>
              <a
                href={contact.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-whatsapp-ink hover:text-whatsapp-ink-hover"
              >
                <WhatsAppIcon size={16} />
                שליחת הודעה בוואטסאפ
              </a>
            </li>
          )}
        </ul>
      ) : (
        <p className="pdp-details__list pdp-details__label">פרטי הספק יתעדכנו בקרוב.</p>
      )}

      <p className="pdp-details__note">{FULFILMENT_NOTE[productType]}</p>
    </section>
  )
}
