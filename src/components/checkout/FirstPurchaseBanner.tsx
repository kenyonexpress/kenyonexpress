'use client'

import { t } from '@/lib/i18n/messages'
import { readSnooze, writeSnooze } from '@/lib/pwa/snooze'
import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * Shown after a customer's FIRST paid order: two suggestions, each a link to
 * the page where the customer does it themselves. A passkey so the next
 * sign-in is one touch, and "everything in the app" so the coupon and parcel
 * updates reach them. It asks nothing itself: no browser permission dialog
 * opens from here, and no consent is recorded by viewing it. The consent is
 * recorded only when the customer flips the switch on the notifications page.
 *
 * TWO PLACES, ONE SNOOZE. It sits on the order confirmation, which a customer
 * sees once, and on the account overview, which they come back to. "Not now"
 * hides it in both for thirty days (`lib/pwa/snooze`), after which it is
 * offered again; there is no permanent dismissal, because the two things it
 * suggests stay worth doing. Once a passkey exists the passkey link is gone
 * and only the in-app suggestion remains.
 *
 * DECIDED ON THE CLIENT, so the server renders nothing and the banner appears
 * after hydration or not at all. The alternative, rendering it and hiding it
 * in an effect, flashes a banner the customer already dismissed.
 */

export const FIRST_PURCHASE_BANNER_SNOOZE_KEY = 'ke:first-purchase-banner:snoozed-until'

export default function FirstPurchaseBanner({ hasPasskeys = false }: { hasPasskeys?: boolean }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (readSnooze(FIRST_PURCHASE_BANNER_SNOOZE_KEY, Date.now())) return
    setVisible(true)
  }, [])

  function dismiss(): void {
    writeSnooze(FIRST_PURCHASE_BANNER_SNOOZE_KEY, Date.now())
    setVisible(false)
  }

  if (!visible) return null

  return (
    <section
      dir="rtl"
      aria-label={t('firstPurchase.label')}
      data-testid="first-purchase-banner"
      className="mx-auto mt-6 max-w-xl rounded-2xl border border-gray-200 bg-white p-4 text-start"
    >
      <p className="font-bold text-heading text-sm">{t('firstPurchase.title')}</p>
      <p className="mt-1 text-gray-500 text-xs leading-relaxed">{t('firstPurchase.body')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!hasPasskeys && (
          <Link
            href="/account/security"
            className="min-h-touch-min rounded-xl bg-brand-primary px-4 py-2 font-bold text-heading text-xs transition-opacity hover:opacity-90"
          >
            {t('firstPurchase.passkeyCta')}
          </Link>
        )}
        <Link
          href="/account/notifications"
          className="min-h-touch-min rounded-xl border border-gray-300 px-4 py-2 font-bold text-heading text-xs transition-opacity hover:opacity-90"
        >
          {t('firstPurchase.appCta')}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="min-h-touch-min ms-auto px-2 py-2 text-gray-500 text-xs hover:text-link"
        >
          {t('firstPurchase.dismiss')}
        </button>
      </div>
    </section>
  )
}
