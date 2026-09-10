import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * NOINDEX, and the canonical is the reason rather than the crawl budget. The root
 * layout declares `alternates.canonical: '/'` and Next inherits metadata, so a
 * page that sets neither tells Google it IS the home page - measured 2026-09-10
 * on sixteen public routes, this one among them.
 */
export const metadata: Metadata = {
  title: 'אמתו את האימייל — KenyonExpress',
  robots: { index: false, follow: true },
  // A SELF-CANONICAL BESIDE THE NOINDEX, and the pair is deliberate. Without it
  // this page inherits the root layout's canonical of '/', and noindex plus a
  // canonical pointing at ANOTHER url is a contradiction Google resolves by
  // following the canonical - which would aim the noindex at the home page. The
  // same url in both fields says exactly one thing: do not index this, and it
  // stands for nothing else.
  alternates: { canonical: '/signup/confirm' },
}

export default function ConfirmPage() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
      <div className="text-5xl mb-4">📬</div>
      <h2 className="text-xl font-semibold mb-2">בדקו את תיבת הדואר</h2>
      <p className="text-sm text-gray-500 mb-6">
        שלחנו לכם קישור לאימות. לחצו עליו כדי להפעיל את החשבון.
      </p>
      <Link href="/login" className="text-link text-sm font-medium hover:underline">
        חזרה לכניסה
      </Link>
    </div>
  )
}
