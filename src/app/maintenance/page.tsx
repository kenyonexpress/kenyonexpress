import Link from 'next/link'
import { ReloadButton } from './ReloadButton'

export const metadata = {
  title: 'האתר בתחזוקה',
  robots: { index: false, follow: true },
}

/**
 * Where page visits go while maintenance mode is on (the proxy redirects
 * here). Plain and dependency-free on purpose: it has to render while the
 * rest of the site is the thing being worked on.
 *
 * Styled to match the 404 and 500 error pages, so a customer who arrives
 * during maintenance sees the same storefront they would on any other system
 * page. The visual language is consistent: brand yellow numeral, Hebrew RTL,
 * design tokens for text and spacing.
 *
 * A server component: only the refresh button is a client component, so the
 * page can declare its own (noindex) metadata.
 */
export default function MaintenancePage() {
  return (
    <main dir="rtl" className="w-full bg-brand-accent">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-lg text-center">
          {/* Maintenance icon in brand yellow, matching 404/500 numerals */}
          <div className="mb-6 flex justify-center" aria-hidden="true">
            <svg
              className="h-20 w-20 text-brand-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              role="img"
              aria-label="אייקון תחזוקה"
            >
              <title>אייקון תחזוקה</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>

          <h1 className="text-4xl font-bold text-heading">האתר בעבודת תחזוקה קצרה</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            אנחנו משדרגים את האתר כדי לשרת אתכם טוב יותר. התהליך אמור להימשך מספר דקות בלבד.
          </p>

          {/* Estimated time notice */}
          <div className="mt-8 rounded-lg border border-brand-primary/20 bg-brand-primary/10 px-6 py-4">
            <p className="text-sm font-semibold text-heading">זמן משוער: 5-10 דקות</p>
            <p className="mt-1 text-xs text-muted">נשתדל לחזור מהר ככל האפשר. תודה על הסבלנות.</p>
          </div>

          {/* Contact information */}
          <div className="mt-12 border-t border-border pt-8">
            <p className="mb-4 text-sm font-semibold text-heading">צריכים עזרה דחופה?</p>
            <p className="text-sm leading-relaxed text-muted">
              ניתן ליצור קשר עם שירות הלקוחות שלנו בטלפון{' '}
              <span dir="ltr" className="font-semibold text-heading">
                03-1234567
              </span>{' '}
              או במייל{' '}
              <a
                href="mailto:support@kenyonexpress.co.il"
                className="font-semibold text-brand-dark transition-colors hover:text-brand-primary"
              >
                support@kenyonexpress.co.il
              </a>
            </p>
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-col gap-3">
            <ReloadButton />
            <Link
              href="/"
              className="inline-block rounded-lg border-2 border-brand-dark px-8 py-3 text-base font-bold text-brand-dark transition-colors hover:bg-brand-dark hover:text-white"
            >
              לדף הבית
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
