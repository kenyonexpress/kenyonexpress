import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { buildOrderInquiryText, storeWhatsAppLink } from '@/lib/whatsapp'

type Props = {
  /** Full order id; the message carries the same 8-char short id the shopper sees. */
  orderId: string
  label?: string
  className?: string
}

/** wa.me link to the store about one order. No sending. */
export default function OrderContactLink({
  orderId,
  label = 'שאלה על ההזמנה בוואטסאפ',
  className,
}: Props) {
  const href = storeWhatsAppLink(buildOrderInquiryText(orderId.slice(0, 8).toUpperCase()))
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        'inline-flex items-center gap-2 text-sm font-semibold text-whatsapp-ink hover:text-whatsapp-ink-hover transition-colors'
      }
    >
      <WhatsAppIcon size={18} />
      {label}
    </a>
  )
}
