'use client'

import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { waShareLink } from '@/lib/whatsapp'

type Props = {
  /** Message body. When appendCurrentUrl is set, the page URL is added on a new line. */
  message: string
  appendCurrentUrl?: boolean
  label?: string
  className?: string
}

/** Opens the WhatsApp share sheet with a prefilled Hebrew message. */
export default function WhatsAppShareButton({
  message,
  appendCurrentUrl = false,
  label = 'שתפו בוואטסאפ',
  className,
}: Props) {
  const handleClick = () => {
    const text = appendCurrentUrl ? `${message}\n${window.location.href}` : message
    window.open(waShareLink(text), '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        'inline-flex items-center gap-2 text-sm font-semibold text-whatsapp-ink hover:text-whatsapp-ink-hover transition-colors'
      }
    >
      <WhatsAppIcon size={18} />
      {label}
    </button>
  )
}
