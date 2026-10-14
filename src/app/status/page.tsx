import WhatsAppSupportButton from '@/components/help/WhatsAppSupportButton'
import StatusPanel from '@/components/status/StatusPanel'
import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * `/status`: the public status page the 500 page links to (UX26).
 *
 * OUTSIDE EVERY ROUTE GROUP ON PURPOSE. The page is for the minute the site
 * is broken, so it must not depend on the thing that is broken: no store
 * shell (its header reads the category menu), no provider, no data read on
 * the server at all. It is a static shell under the root layout with a
 * brand link home, and `StatusPanel` asks `/api/ready` from the browser.
 *
 * `noindex`: a page whose content is "everything is fine" is not a search
 * result anyone wants, and during an outage it must not be the one page of
 * the site that still ranks.
 */
export const metadata: Metadata = {
  title: 'מצב המערכת',
  robots: { index: false, follow: false },
}

const STATUS_WHATSAPP_TEXT = 'שלום, אני רואה תקלה בדף מצב המערכת של קניון אקספרס'

export default function StatusPage() {
  return (
    <main
      id="main-content"
      dir="rtl"
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-10 font-sans md:py-14"
    >
      <header className="mb-8 text-center">
        <Link href="/" data-status-mark className="inline-block text-2xl font-bold text-heading">
          קניון אקספרס
        </Link>
      </header>

      <h1 className="text-2xl font-bold text-heading md:text-3xl">מצב המערכת</h1>
      <p className="mt-2 mb-6 text-sm leading-relaxed text-muted md:text-base">
        הדף הזה נטען בלי מסד הנתונים, כך שאפשר לקרוא אותו גם בזמן תקלה. הבדיקה רצה מהדפדפן שלכם מול
        השרת ומתעדכנת לבד.
      </p>

      <StatusPanel />

      <nav
        aria-label="דרכים להמשיך"
        className="mt-8 flex flex-wrap items-center justify-center gap-3"
      >
        <Link
          href="/"
          className="inline-flex min-h-touch-min items-center rounded-pill bg-brand-primary px-6 text-sm font-bold text-heading transition-colors hover:bg-brand-primary-hover"
        >
          לדף הבית
        </Link>
        <Link
          href="/contact"
          className="inline-flex min-h-touch-min items-center rounded-pill border border-border px-6 text-sm font-bold text-heading transition-colors hover:bg-surface-hover"
        >
          צרו קשר
        </Link>
        <WhatsAppSupportButton text={STATUS_WHATSAPP_TEXT} />
      </nav>
    </main>
  )
}
