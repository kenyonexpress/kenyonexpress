import CopyLinkButton from '@/components/shared/CopyLinkButton'
import NativeShareButton from '@/components/shared/NativeShareButton'
import WhatsAppShareButton from '@/components/shared/WhatsAppShareButton'
import { type ShareSubject, buildShareMessage } from '@/lib/share/message'
import { cn } from '@/lib/utils'

type Props = {
  /** Title for the OS share sheet. */
  title: string
  /** What is shared. The text comes from buildShareMessage, never the caller. */
  subject: ShareSubject
  /** Absolute URL of the page being shared. */
  url: string
  /** Names the product in the whatsapp_click event when the share is a PDP's. */
  productId?: string
  className?: string
}

/**
 * The share actions in their fixed order: WhatsApp, the OS share sheet, copy
 * link. Every one is user-initiated -- nothing here sends a WhatsApp message on
 * the shopper's behalf, it only opens wa.me with the text prefilled.
 */
export default function ShareMenu({ title, subject, url, productId, className }: Props) {
  const message = buildShareMessage(subject)
  return (
    <div className={cn('inline-flex flex-wrap items-center gap-4', className)} data-share-menu>
      <WhatsAppShareButton productId={productId} message={`${message}\n${url}`} />
      <NativeShareButton title={title} text={message} url={url} />
      <CopyLinkButton url={url} />
    </div>
  )
}
