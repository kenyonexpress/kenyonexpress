'use client'

import CopyLinkButton from '@/components/shared/CopyLinkButton'
import FacebookShareButton from '@/components/shared/FacebookShareButton'
import TelegramShareButton from '@/components/shared/TelegramShareButton'
import WhatsAppShareButton from '@/components/shared/WhatsAppShareButton'
import { useShareAttribution } from '@/components/shared/useShareAttribution'
import { t } from '@/lib/i18n/messages'
import { Mail, Share2 } from 'lucide-react'
import { useState } from 'react'

/**
 * The product-page share row, in the order the owner asked for it (23.09):
 * WhatsApp first and most prominent, then a Share button, then Copy Link.
 *
 * WHATSAPP IS ALWAYS USER-INITIATED, HERE AND EVERYWHERE ELSE ON THIS PAGE.
 * `WhatsAppShareButton` opens `wa.me` on a click the customer made; nothing
 * in this row (or in the outbox on the server side) sends a WhatsApp message
 * on a product-share event. That is a deliberate invariant, not an oversight
 * -- the owner named it explicitly when asking for this row's order.
 *
 * THE "SHARE" BUTTON PREFERS THE PLATFORM'S OWN SHEET. `navigator.share` is
 * what iOS/Android/most mobile browsers already give a customer -- their own
 * contacts, their own installed apps, in an order they chose, not a picklist
 * this component invents. It is undefined on most desktop browsers, which is
 * exactly when the row falls back to naming the specific channels instead.
 *
 * EVERY CHANNEL SHARES THE SAME URL, and for a signed-in customer with a code
 * that URL carries `?ref=<code>` (useShareAttribution). That is the whole of
 * "users share deals" in the affiliate programme: the link a customer sends
 * from here is the link that attributes the friend's order to them. The
 * visible row is identical with or without a code; only the href changes.
 */
export default function ProductShareRow({
  productId,
  message,
}: {
  productId: string
  /** buildShareMessage(...) output, computed once by the caller from the
   * offer/price the page actually shows -- see lib/share/message.ts for why
   * this component must not compute its own number. */
  message: string
}) {
  const [showFallback, setShowFallback] = useState(false)
  const { shareHref, code } = useShareAttribution()

  async function handleShareClick() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: message, text: message, url: shareHref() })
      } catch {
        // AbortError on cancel, or a share target that failed silently on its
        // own end. Either way there is nothing useful for this button to do.
      }
      return
    }
    setShowFallback((v) => !v)
  }

  return (
    <div className="flex flex-col gap-2" data-share-attributed={code ? 'true' : 'false'}>
      <div className="flex flex-wrap items-center gap-4">
        <WhatsAppShareButton
          productId={productId}
          message={message}
          appendCurrentUrl
          url={shareHref}
          className="inline-flex items-center gap-2 text-base font-bold text-whatsapp-ink transition-colors hover:text-whatsapp-ink-hover"
        />

        <button
          type="button"
          onClick={() => void handleShareClick()}
          className="inline-flex items-center gap-2 text-sm font-semibold text-heading transition-colors hover:opacity-80"
        >
          <Share2 size={18} />
          {t('share.shareLabel')}
        </button>

        <CopyLinkButton url={shareHref} />
      </div>

      {/* Desktop fallback: shown only once a click already proved
          navigator.share is unavailable, never guessed from user-agent. */}
      {showFallback && (
        <div className="flex flex-wrap items-center gap-4 ps-1">
          <FacebookShareButton url={shareHref} />
          <TelegramShareButton text={message} url={shareHref} />
          <a
            href={`mailto:?subject=${encodeURIComponent(message)}&body=${encodeURIComponent(`${message}\n${shareHref()}`)}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-heading transition-colors hover:opacity-80"
          >
            <Mail size={18} />
            {t('share.emailLabel')}
          </a>
        </div>
      )}
    </div>
  )
}
