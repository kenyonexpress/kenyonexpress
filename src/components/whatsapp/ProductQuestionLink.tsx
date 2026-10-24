import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { buildSupplierInquiryText, storeWhatsAppLink } from '@/lib/whatsapp'

type Props = {
  productName: string | null
  /** Product page URL, appended on its own line so the shop knows which deal. */
  url?: string
  label?: string
  className?: string
}

/** wa.me link to the store with the product named in the message. No sending. */
export default function ProductQuestionLink({
  productName,
  url,
  label = 'שאלה על המוצר בוואטסאפ',
  className,
}: Props) {
  const href = storeWhatsAppLink(buildSupplierInquiryText(productName, url))
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
