import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * NOINDEX, and the canonical is the reason rather than the crawl budget. The root
 * layout declares `alternates.canonical: '/'` and Next inherits metadata, so a
 * page that sets neither tells Google it IS the home page - measured 2026-09-10
 * on sixteen public routes, this one among them.
 */
export const metadata: Metadata = {
  title: 'אין הרשאת ספק',
  robots: { index: false, follow: true },
  // A SELF-CANONICAL BESIDE THE NOINDEX, and the pair is deliberate. Without it
  // this page inherits the root layout's canonical of '/', and noindex plus a
  // canonical pointing at ANOTHER url is a contradiction Google resolves by
  // following the canonical - which would aim the noindex at the home page. The
  // same url in both fields says exactly one thing: do not index this, and it
  // stands for nothing else.
  alternates: { canonical: '/supplier/access-denied' },
}

export default function SupplierAccessDeniedPage() {
  return (
    <main
      dir="rtl"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12"
    >
      <h1 className="text-2xl font-bold text-heading">אין גישה לאזור הספקים</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        החשבון מחובר, אבל אינו רשום כחבר פעיל אצל ספק. אם אתם בית עסק חדש, הגישו בקשה דרך התמיכה או
        המתינו לאישור המנהל.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/login?next=/supplier"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heading px-4 text-sm font-bold text-white"
        >
          התחברות עם חשבון אחר
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700"
        >
          חזרה לחנות
        </Link>
      </div>
    </main>
  )
}
