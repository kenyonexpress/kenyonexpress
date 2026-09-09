import { isAllowedImageUrl } from '@/lib/images/remote-hosts'
import { buildSupplierContact } from '@/lib/supplier-contact'
import type { SupplierStorefront } from '@/lib/supplier-storefront'
import Image from 'next/image'

/**
 * The supplier's own page said less about the supplier than any product page.
 *
 * WHAT WAS MEASURED, 2026-09-09, against production. The loader already
 * selected `logo_url` and `contact_phone`, the type already carried both, and
 * the header rendered NEITHER -- it printed the name, the city and the address.
 * Of 12 suppliers: 6 have a phone, 6 have a WhatsApp number, 1 has a logo and
 * **0 have an address**. So the one field this page rendered is the one field
 * nobody has filled, and the two it dropped are filled for half of them.
 *
 * `whatsapp` was not even selected, and for an Israeli marketplace that is the
 * contact channel that gets answered.
 *
 * WHY `buildSupplierContact` AND NOT A LOCAL BLOCK. The product page and the
 * coupon page already reach a business through it, and the reason is written up
 * there: a hand-rolled `wa.me/${phone}` keeps the leading zero of a local
 * number and lands the customer on WhatsApp's "this number is not on WhatsApp"
 * screen. The supplier's own page was the last one composing nothing at all;
 * composing its own version would have been the third copy of a rule that has
 * already been got wrong once.
 *
 * `SupplierInfo` itself is deliberately not reused: it takes a product type and
 * closes with a sentence about how THIS product reaches you, which has no
 * meaning on a page listing forty of them.
 *
 * THE LOGO IS RENDERED BUT BARELY EXISTS. Exactly one supplier has one today
 * and it is `/images/logo.webp`, the site's own mark, on the row where the
 * platform is its own supplier. That is honest for that row and it is not
 * evidence the feature works; it is a column waiting to be filled. Guarded by
 * `isAllowedImageUrl`, because a remote host that `next.config` does not list
 * throws at render, and a supplier logo pasted in by an operator is exactly
 * where an unlisted host arrives.
 */
export default function SupplierStorefrontHeader({ supplier }: { supplier: SupplierStorefront }) {
  const contact = buildSupplierContact(
    supplier ? { ...supplier, contact_phone: supplier.contactPhone } : null,
  )
  const logo = supplier.logoUrl && isAllowedImageUrl(supplier.logoUrl) ? supplier.logoUrl : null

  return (
    <header className="mb-6 flex items-start gap-4">
      {logo ? (
        <Image
          src={logo}
          alt=""
          width={72}
          height={72}
          className="h-18 w-18 shrink-0 rounded-xl border border-black/10 object-contain"
        />
      ) : null}
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-black/50">ספק</p>
        <h1 className="text-2xl font-bold text-heading">{supplier.name}</h1>
        {contact.addressLine ? (
          <p className="text-sm text-black/60">
            {contact.wazeHref ? (
              <a
                href={contact.wazeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {contact.addressLine}
              </a>
            ) : (
              contact.addressLine
            )}
          </p>
        ) : null}
        {contact.telHref || contact.whatsappHref ? (
          <p className="flex flex-wrap gap-4 text-sm">
            {contact.telHref ? (
              <a href={contact.telHref} className="text-brand-dark underline" dir="ltr">
                {contact.phoneDisplay}
              </a>
            ) : null}
            {contact.whatsappHref ? (
              <a
                href={contact.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-dark underline"
              >
                וואטסאפ
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
    </header>
  )
}
