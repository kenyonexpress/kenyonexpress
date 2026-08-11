import { ABOUT_UPDATED_AT, aboutIntro, aboutSections } from '@/content/about'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'אודות',
  description:
    'מי אנחנו וכיצד עובדת רכישת קופון בקניון אקספרס: תשלום מקדים, שובר עם QR, יתרה בבית העסק, תוקף וזיכוי אוטומטי בפקיעה.',
  alternates: { canonical: '/about' },
}

/**
 * The about page.
 *
 * Structure and spacing are copied from `/faq`, which was itself measured
 * against the live template: the same `max-w-page` frame, the same breadcrumb,
 * the same `max-w-3xl` measure for body text. A new marketing page with its own
 * rhythm is exactly what the comparison gate exists to catch, and matching an
 * existing page is cheaper than defending a new one.
 *
 * The content is a typed module rather than JSX, for the reason
 * `content/legal/faq.ts` gives: what the site claims about itself has to be
 * reviewable in one file, not spread through markup.
 */
export default function AboutPage() {
  const updated = new Date(ABOUT_UPDATED_AT).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">אודות</span>
      </nav>

      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">אודות קניון אקספרס</h1>
        <p className="mt-2 text-sm text-heading/70">עודכן לאחרונה: {updated}</p>
        <p className="mt-4 text-base leading-relaxed text-heading/80">{aboutIntro}</p>
      </header>

      <div className="max-w-3xl space-y-8">
        {aboutSections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-semibold text-heading">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-base leading-relaxed text-heading/80">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <section className="rounded-xl border border-heading/10 bg-brand-accent/40 p-5">
          <h2 className="text-lg font-semibold text-heading">רוצים להצטרף כספקים?</h2>
          <p className="mt-2 text-base leading-relaxed text-heading/80">
            בתי עסק שרוצים למכור דרכנו מוזמנים להשאיר פרטים, ונחזור אליכם.
          </p>
          <Link
            href="/suppliers"
            className="mt-4 inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-heading"
          >
            הצטרפות כספק
          </Link>
        </section>
      </div>
    </main>
  )
}
