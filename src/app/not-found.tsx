import ErrorPageFrame from '@/components/error-pages/ErrorPageFrame'
import { t } from '@/lib/i18n/messages'
import Link from 'next/link'

/**
 * The 404 every notFound() in the app lands on.
 *
 * There was no not-found.tsx at all, so a missing product, a mistyped category
 * or a dead promo link rendered Next's built-in English page: left-to-right,
 * unstyled, and off-brand in the middle of a Hebrew storefront. The product
 * page alone calls notFound() on every unknown slug, so this is not a rare
 * corner - it is the page a customer sees whenever a link rots.
 *
 * Deliberately not a dead end. A 404 usually means the visitor wanted something
 * that exists under a different name, so it offers the catalogue and the
 * categories rather than only a way back to the homepage. There is no search
 * UI anywhere on the site, so no search link here either.
 *
 * G7: branded through ErrorPageFrame (logo, Electro palette redefined
 * locally, support by mail and WhatsApp).
 */

export const metadata = {
  title: 'הדף לא נמצא',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <ErrorPageFrame
      code="404"
      title={t('errorPages.notFoundTitle')}
      text={t('errorPages.notFoundText')}
      actions={
        <>
          <Link href="/products" className="ke-error-page__btn">
            {t('errorPages.allProducts')}
          </Link>
          <Link href="/products?view=categories" className="ke-error-page__btn--secondary">
            {t('errorPages.browseCategories')}
          </Link>
          <Link href="/" className="ke-error-page__btn--secondary">
            {t('errorPages.home')}
          </Link>
        </>
      }
    />
  )
}
