'use client'

import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { track } from '@/lib/analytics/tracker'
import { waShareLink } from '@/lib/whatsapp'

type Props = {
  /** Message body. When appendCurrentUrl is set, the page URL is added on a new line. */
  message: string
  appendCurrentUrl?: boolean
  label?: string
  className?: string
  /** Names the product in the whatsapp_click event when the share is a PDP's. */
  productId?: string
  /**
   * The URL to append instead of the bare page URL, read at click time. The
   * product share row passes the page URL with the sharer's code on it
   * (useShareAttribution); everything else leaves it unset.
   */
  url?: () => string
}

/** Opens the WhatsApp share sheet with a prefilled Hebrew message. */
export default function WhatsAppShareButton({
  message,
  appendCurrentUrl = false,
  label = 'שתפו בוואטסאפ',
  className,
  productId,
  url,
}: Props) {
  const handleClick = () => {
    // Before the window opens: an exit to a chat is precisely the moment the
    // page loses the shopper, so the event must not wait for a return.
    track('whatsapp_click', productId ? { product_id: productId } : {})
    const href = url ? url() : window.location.href
    const text = appendCurrentUrl ? `${message}\n${href}` : message
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
