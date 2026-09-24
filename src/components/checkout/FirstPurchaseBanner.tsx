import { t } from '@/lib/i18n/messages'
import Link from 'next/link'

/**
 * Shown once, on the confirmation of a customer's FIRST paid order: two
 * suggestions, each a link to the page where the customer does it themselves.
 * A passkey so the next sign-in is one touch, and "everything in the app" so the
 * coupon and parcel updates reach them. It asks nothing itself: no browser
 * permission dialog opens from here, and no consent is recorded by viewing it.
 * The consent is recorded only when the customer flips the switch on the
 * notifications page.
 */
export default function FirstPurchaseBanner() {
  return (
    <section
      dir="rtl"
      aria-label={t('firstPurchase.label')}
      data-testid="first-purchase-banner"
      className="mx-auto mt-6 max-w-xl rounded-2xl border border-gray-200 bg-white p-4 text-start"
    >
      <p className="font-bold text-heading text-sm">{t('firstPurchase.title')}</p>
      <p className="mt-1 text-gray-500 text-xs leading-relaxed">{t('firstPurchase.body')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/account/security"
          className="min-h-touch-min rounded-xl bg-brand-primary px-4 py-2 font-bold text-heading text-xs transition-opacity hover:opacity-90"
        >
          {t('firstPurchase.passkeyCta')}
        </Link>
        <Link
          href="/account/notifications"
          className="min-h-touch-min rounded-xl border border-gray-300 px-4 py-2 font-bold text-heading text-xs transition-opacity hover:opacity-90"
        >
          {t('firstPurchase.appCta')}
        </Link>
      </div>
    </section>
  )
}
