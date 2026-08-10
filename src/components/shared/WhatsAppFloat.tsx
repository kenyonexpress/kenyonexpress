import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { storeWhatsAppLink } from '@/lib/whatsapp'

/**
 * Floating "talk to us on WhatsApp" button, per `KE_LIVE_SPEC.md`.
 * Sits at the bottom-end corner (bottom-left in RTL), above the content.
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
      className="fixed bottom-5 end-5 z-40 w-14 h-14 rounded-full bg-whatsapp text-white shadow-lg shadow-black/20 flex items-center justify-center transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-whatsapp"
    >
      <WhatsAppIcon size={30} />
    </a>
  )
}
