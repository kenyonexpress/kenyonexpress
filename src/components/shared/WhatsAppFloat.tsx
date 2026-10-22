import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { storeWhatsAppLink } from '@/lib/whatsapp'

/**
 * Floating "talk to us on WhatsApp" button, per `KE_LIVE_SPEC.md`.
 * Sits at the bottom-START corner (bottom-RIGHT in RTL), above the content.
 * The spec says only "bottom corner"; the side is live's. Measured in the
 * live archive on 2026-10-20 at 380, 768 and 1440: the green circle is at
 * the right edge (x~740 of 768). Ours was `end-5`, the left, and the swap
 * read as 17-35% in the y2400-2600 bands at every width because both the
 * missing circle on one side and the extra one on the other count.
 *
 * The number resolves through `storeWhatsAppLink`, which falls back to the
 * published one when `NEXT_PUBLIC_WHATSAPP_PHONE` is unset. Before [68] this
 * button was the ONLY one of the three store-number surfaces that read the env
 * var, so a deployment without it lost the button while the footer icon and the
 * contact page carried on working -- a failure with no symptom anyone reports.
 */
export default function WhatsAppFloat() {
  const href = storeWhatsAppLink('שלום, אשמח לעזרה עם הזמנה באתר KenyonExpress')
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="דברו איתנו בוואטסאפ"
      title="דברו איתנו בוואטסאפ"
      className="fixed bottom-5 start-5 z-40 w-14 h-14 rounded-full bg-whatsapp text-white shadow-lg shadow-black/20 flex items-center justify-center transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-whatsapp"
    >
      <WhatsAppIcon size={30} />
    </a>
  )
}
