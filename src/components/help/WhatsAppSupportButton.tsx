import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { formatIsraeliPhoneDisplay, storeWhatsAppLink, storeWhatsAppNumber } from '@/lib/whatsapp'

/**
 * The help centre's WhatsApp button (STEP 50): the store number through
 * `lib/whatsapp` ([68]) so it cannot drift from the floating button, the footer
 * and the contact page, with the printed digits coming from the same call as
 * the link.
 */
export default function WhatsAppSupportButton({
  text = 'שלום, אשמח לעזרה דרך מרכז העזרה של KenyonExpress',
}: {
  text?: string
}) {
  const href = storeWhatsAppLink(text)
  const display = formatIsraeliPhoneDisplay(storeWhatsAppNumber())
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="whatsapp-support"
      className="inline-flex min-h-12 items-center gap-3 rounded-xl bg-whatsapp px-5 py-3 text-base font-bold text-white shadow-sm transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-whatsapp"
    >
      <WhatsAppIcon size={26} />
      <span>
        תמיכה בוואטסאפ
        {display && (
          <span dir="ltr" className="ms-2 font-normal opacity-90">
            {display}
          </span>
        )}
      </span>
    </a>
  )
}
