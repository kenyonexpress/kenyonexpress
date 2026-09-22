'use client'

import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { track } from '@/lib/analytics/tracker'
import { t } from '@/lib/i18n/messages'

/**
 * "Ask the business" on a product or supplier page. `via` says whether the
 * chat reaches the supplier or customer service, and the label says so too,
 * because a shopper who thinks they are writing to the spa and reaches the
 * platform's support line has been misled by a button.
 */
export default function AskBusinessButton({
  href,
  via,
  productId,
  supplierId,
}: {
  href: string
  via: 'supplier' | 'customer_service'
  productId?: string | null
  supplierId?: string | null
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="ask-business"
      data-via={via}
      onClick={() =>
        track('whatsapp_click', {
          channel: via === 'supplier' ? 'supplier' : 'customer_service',
          surface: 'ask_business',
          ...(productId ? { product_id: productId } : {}),
          ...(supplierId ? { supplier_id: supplierId } : {}),
        })
      }
      // bg-whatsapp-ink, not bg-whatsapp: white on the bright #25d366 mark
      // measures ~1.98:1 (axe: color-contrast, serious). WhatsApp's own
      // darker teal (also in src/styles/tokens.css, already used as link
      // ink elsewhere) carries white at 7.67:1 -- same trade already made
      // for --color-promo-flame, see the comment there.
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-whatsapp-ink px-4 text-sm font-bold text-white transition-transform hover:scale-[1.02]"
    >
      <WhatsAppIcon size={18} />
      {via === 'supplier' ? t('contact.askBusiness') : t('contact.askStore')}
    </a>
  )
}
