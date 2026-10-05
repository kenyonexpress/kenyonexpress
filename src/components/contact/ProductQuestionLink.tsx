'use client'

import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { track } from '@/lib/analytics/tracker'
import type { AskBusinessTarget } from '@/lib/contact/channels'
import { appendPageUrl, productQuestionLink } from '@/lib/contact/inquiry-links'
import { t } from '@/lib/i18n/messages'
import { useEffect, useState } from 'react'

/**
 * "Ask about this product": opens a WhatsApp chat prefilled with the product
 * name and this page's address. The customer sends it; the site sends nothing.
 *
 * WHO ANSWERS IS DECIDED BY THE PAGE, NOT HERE. `ask` is `askBusinessHref`'s
 * output: the supplier's own number when the product opted in and the row has
 * one, otherwise customer service. This link used to dial the store
 * unconditionally while the supplier block lower on the same page dialled the
 * business, so one page offered two destinations under two near-identical
 * labels. Now both read the same target, and the line under the link says in
 * plain words who the message reaches, because a shopper who believes they are
 * writing to the spa and lands on the platform's support line was misled by a
 * button. Without `ask` (customer-service channel switched off) the link falls
 * back to the store number as before.
 *
 * The address is read after mount, so the server render and the first client
 * render agree (no hydration mismatch) and the link gains the URL a moment
 * later.
 */
export default function ProductQuestionLink({
  productName,
  productId = null,
  ask = null,
}: {
  productName: string
  productId?: string | null
  ask?: AskBusinessTarget | null
}) {
  const [pageUrl, setPageUrl] = useState<string | undefined>(undefined)
  useEffect(() => setPageUrl(window.location.href), [])

  const via = ask?.via ?? 'customer_service'
  const href = ask
    ? pageUrl
      ? appendPageUrl(ask.href, pageUrl)
      : ask.href
    : productQuestionLink(productName, pageUrl)
  if (!href) return null

  return (
    <div className="flex flex-col gap-1" data-testid="product-question" data-via={via}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="product-question-link"
        onClick={() =>
          track('whatsapp_click', {
            channel: via,
            surface: 'product_question',
            ...(productId ? { product_id: productId } : {}),
          })
        }
        className="tap-area [--tap-size:36px] inline-flex items-center gap-2 text-sm font-semibold text-heading transition-colors hover:opacity-80"
      >
        <WhatsAppIcon size={18} />
        {via === 'supplier' ? t('contact.askBusiness') : t('contact.productQuestion')}
      </a>
      {/*
        /80 and not /70: at 12px the note is small text and needs 4.5:1. The
        heading colour at 70% on white is #70787f, 4.48:1, and Lighthouse
        mobile failed the product page's accessibility on exactly this node
        (2026-10-05, W12, score 97). At 80% it is #5c656d, 5.9:1.
      */}
      <p className="text-xs text-heading/80" data-testid="product-question-note">
        {via === 'supplier' ? t('contact.viaSupplier') : t('contact.viaStore')}
      </p>
    </div>
  )
}
