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

export default function NotFound() {
  return (
    <main dir="rtl" className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <p className="text-6xl font-black text-brand-primary" aria-hidden="true">
        404
      </p>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">הדף שחיפשתם לא נמצא</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">
        ייתכן שהקישור ישן, שהמוצר כבר לא במלאי, או שנפלה שגיאת הקלדה בכתובת.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/products"
          className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          לכל המוצרים
        </Link>
        {/* Was a "חיפוש באתר" link to /search. The standing project rule is
            that there is no search UI anywhere, and after the D3 sweep took the
            field out of the header this 404 was the last entry point to it left
            in the storefront. The categories page is the honest destination for
            "I could not find the thing I wanted". */}
        <Link
          href="/products?view=categories"
          className="rounded-xl border border-border px-6 py-3 text-sm font-bold text-heading transition-colors hover:bg-surface-hover"
        >
          עיון בקטגוריות
        </Link>
        <Link
          href="/"
          className="rounded-xl px-6 py-3 text-sm font-bold text-gray-500 transition-colors hover:text-gray-900"
        >
          לדף הבית
        </Link>
      </div>
    </main>
  )
}
