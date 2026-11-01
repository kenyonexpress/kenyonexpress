import Link from 'next/link'

/**
 * The 404 every notFound() in the app lands on.
 *
 * There was no not-found.tsx at all, so a missing product, a mistyped category
 * or a dead promo link rendered Next's built-in English page: left-to-right,
 * unstyled, and off-brand in the middle of a Hebrew storefront.
 *
 * Deliberately not a dead end, and deliberately static: it reads no data. A
 * 404 that queries the database fails exactly when the visitor most needs a
 * way back, so it offers the catalogue and the homepage and nothing that can
 * itself fail.
 */

export const metadata = {
  title: '404 - הדף לא נמצא',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <main dir="rtl" className="w-full bg-brand-accent">
      <div className="mx-auto max-w-page px-4 py-16 sm:py-24">
        <div className="mb-12 text-center">
          <p className="font-black text-8xl text-brand-primary" aria-hidden="true">
            404
          </p>
          <h1 className="mt-6 font-bold text-4xl text-heading">הדף שחיפשתם לא נמצא</h1>
          <p className="mt-4 text-lg text-muted leading-relaxed">
            ייתכן שהקישור ישן, שהמוצר כבר לא במלאי, או שנפלה שגיאת הקלדה בכתובת.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/products"
            className="inline-block rounded-lg bg-brand-dark px-8 py-3 font-bold text-base text-white transition-transform hover:scale-105"
          >
            לכל המוצרים
          </Link>
          <Link
            href="/products?view=categories"
            className="inline-block rounded-lg border-2 border-brand-dark px-8 py-3 font-bold text-base text-brand-dark transition-colors hover:bg-brand-dark hover:text-white"
          >
            עיון בקטגוריות
          </Link>
          <Link
            href="/"
            className="inline-block rounded-lg bg-brand-primary px-8 py-3 font-bold text-base text-brand-dark transition-transform hover:scale-105"
          >
            לדף הבית
          </Link>
        </div>
      </div>
    </main>
  )
}
