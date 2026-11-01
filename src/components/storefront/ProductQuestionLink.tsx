'use client'

import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { track } from '@/lib/analytics/tracker'
import { storeWhatsAppLink } from '@/lib/whatsapp'
import { useEffect, useState } from 'react'

/**
 * "Ask about this product": a wa.me chat prefilled with the product name and
 * this page's address. The customer sends it; the site sends nothing, so this
 * stays on the click-to-chat side of the line the outbox sender is behind.
 *
 * The address is read after mount so the server render and the first client
 * render agree. Row 17 of docs/BIG-SITE-GAP.md: the question goes to the store
 * number. Stored Q&A needs a table and moderation, and is not built.
 */
export default function ProductQuestionLink({
  productName,
  productId,
}: {
  productName: string
  productId: string
}) {
  const [pageUrl, setPageUrl] = useState<string | undefined>(undefined)
  useEffect(() => setPageUrl(window.location.href), [])

  const opener = `שלום, יש לי שאלה על ${productName}`
  const href = storeWhatsAppLink(pageUrl ? `${opener}\n${pageUrl}` : opener)
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="product-question-link"
      onClick={() =>
        track('whatsapp_click', { surface: 'product_question', product_id: productId })
      }
      className="tap-area inline-flex items-center gap-2 text-sm font-semibold text-heading transition-colors hover:opacity-80"
    >
      <WhatsAppIcon size={18} />
      שאלה על המוצר
    </a>
  )
}
