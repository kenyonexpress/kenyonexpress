import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { storeWhatsAppNumber, waChatLink } from '@/lib/whatsapp'

/**
 * Floating "talk to us on WhatsApp" button. Renders nothing when
 * NEXT_PUBLIC_WHATSAPP_PHONE is not configured.
 * Sits at the bottom-end corner (bottom-left in RTL), above the content.
 */
export default function WhatsAppFloat() {
  const phone = storeWhatsAppNumber()
  if (!phone) return null

  const href = waChatLink(phone, 'שלום, אשמח לעזרה עם הזמנה באתר KenyonExpress')
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
