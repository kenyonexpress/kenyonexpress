import { getAllCategories } from '@/lib/category-page'
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
 * that exists under a different name, so it offers search and the catalog
 * rather than only a way back to the homepage.
 */

export const metadata = {
  title: 'הדף לא נמצא',
  robots: { index: false, follow: true },
}

export default async function NotFound() {
  const allCategories = await getAllCategories()
  // Show first 8 categories as "popular"
  const popularCategories = allCategories.slice(0, 8)

  return (
    <main dir="rtl" className="w-full bg-brand-accent">
      {/* Header section with 404 message */}
      <div className="mx-auto max-w-7xl px-4 py-16 sm:py-24">
        <div className="mb-12 text-center">
          <p className="text-8xl font-black text-brand-primary" aria-hidden="true">
            404
          </p>
          <h1 className="mt-6 text-4xl font-bold text-heading">הדף שחיפשתם לא נמצא</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            ייתכן שהקישור ישן, שהמוצר כבר לא במלאי, או שנפלה שגיאת הקלדה בכתובת.
          </p>
        </div>

        {/* Search bar */}
        <div className="mb-12">
          <form action="/search" method="GET" className="mx-auto max-w-xl">
            <div className="relative">
              <input
                type="text"
                name="q"
                placeholder="חפשו מוצר..."
                aria-label="חיפוש מוצר"
                className="w-full rounded-lg border border-border bg-white px-4 py-3 text-right text-base placeholder-muted focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                autoComplete="off"
              />
              <button
                type="submit"
                className="absolute inset-y-0 left-0 flex items-center rounded-r-lg bg-brand-primary px-4 font-bold text-brand-dark transition-opacity hover:opacity-90"
              >
                חיפוש
              </button>
            </div>
          </form>
        </div>

        {/* Action buttons */}
        <div className="mb-16 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/products"
            className="inline-block rounded-lg bg-brand-dark px-8 py-3 text-base font-bold text-white transition-transform hover:scale-105"
          >
            לכל המוצרים
          </Link>
          <Link
            href="/products?view=categories"
            className="inline-block rounded-lg border-2 border-brand-dark px-8 py-3 text-base font-bold text-brand-dark transition-colors hover:bg-brand-dark hover:text-white"
          >
            עיון בקטגוריות
          </Link>
          <Link
            href="/"
            className="inline-block rounded-lg bg-brand-primary px-8 py-3 text-base font-bold text-brand-dark transition-transform hover:scale-105"
          >
            לדף הבית
          </Link>
        </div>
      </div>

      {/* Popular categories section */}
      {popularCategories.length > 0 && (
        <div className="bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:py-24">
            <h2 className="mb-12 text-center text-3xl font-bold text-heading">
              קטגוריות פופולריות
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {popularCategories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/category/${category.slug}`}
                  className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-all hover:shadow-lg"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-surface-hover">
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand-accent to-brand-accent/50">
                      <span className="text-sm font-semibold text-heading">{category.name_he}</span>
                    </div>
                  </div>
                  <div className="p-4 text-center">
                    <h3 className="transition-colors font-semibold text-heading group-hover:text-brand-primary">
                      {category.name_he}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
