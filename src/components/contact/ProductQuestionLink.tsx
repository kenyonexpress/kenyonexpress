'use client'

import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { productQuestionLink } from '@/lib/contact/inquiry-links'
import { t } from '@/lib/i18n/messages'
import { useEffect, useState } from 'react'

/**
 * "Ask about this product": opens a WhatsApp chat with the store, prefilled
 * with the product name and this page's address. The customer sends it; the
 * site sends nothing. The address is read after mount, so the server render and
 * the first client render agree (no hydration mismatch) and the link gains the
 * URL a moment later.
 */
export default function ProductQuestionLink({ productName }: { productName: string }) {
  const [pageUrl, setPageUrl] = useState<string | undefined>(undefined)
  useEffect(() => setPageUrl(window.location.href), [])

  const href = productQuestionLink(productName, pageUrl)
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="product-question-link"
      className="inline-flex items-center gap-2 text-sm font-semibold text-heading transition-colors hover:opacity-80"
    >
      <WhatsAppIcon size={18} />
      {t('contact.productQuestion')}
    </a>
  )
}
