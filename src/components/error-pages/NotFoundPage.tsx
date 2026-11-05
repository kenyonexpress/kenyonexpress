import ErrorPageFrame from '@/components/error-pages/ErrorPageFrame'
import { t } from '@/lib/i18n/messages'
import Link from 'next/link'

/**
 * The 404 itself, shared by the root not-found.tsx and the route groups' own
 * (S33, 06.11.2026).
 *
 * WHY THE GROUPS HAVE THEIR OWN FILE. A notFound() thrown by a page renders
 * the nearest not-found.tsx INSIDE that page's layout. Every route group's
 * layout already has a <main>, and the root file's frame is a <main> too,
 * because for a URL that matches no route at all it is the whole document. So
 * an unknown product rendered a <main> inside a <main>: axe reported
 * landmark-main-is-top-level, landmark-no-duplicate-main and landmark-unique
 * on it. The group files render this with `as="div"`; the root keeps `main`.
 *
 * Deliberately not a dead end. A 404 usually means the visitor wanted something
 * that exists under a different name, so it offers the catalogue and the
 * categories rather than only a way back to the homepage. There is no search
 * UI anywhere on the site, so no search link here either.
 */
export default function NotFoundPage({ as = 'main' }: { as?: 'main' | 'div' }) {
  return (
    <ErrorPageFrame
      as={as}
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
