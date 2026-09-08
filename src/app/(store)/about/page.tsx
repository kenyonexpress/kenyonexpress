import { ABOUT_UPDATED_AT, aboutSections } from '@/content/about'
import type { Metadata } from 'next'
import Link from 'next/link'
import AboutBreadcrumb from './_components/AboutBreadcrumb'
import AboutJsonLd from './_components/AboutJsonLd'
import AboutNav from './_components/AboutNav'
import { TRUST_UPDATED_AT, aboutLede, aboutStory, whyItIsCheap } from './_content/trust'

export const metadata: Metadata = {
  title: 'אודות',
  description:
    'מי אנחנו, למה בנינו את קניון אקספרס ולמה המחיר כאן נמוך: תשלום מקדים, אחוז פלטפורמה פרטני לכל מוצר, ויתרה שנגבית בבית העסק ולא עוברת דרכנו.',
  alternates: { canonical: '/about' },
}

// One sentence, one place. `Metadata['description']` is `string | null`, so it
// is narrowed here once rather than cast at the JSON-LD call. The literal stays
// inside the metadata object because `src/app/content-pages.test.ts` reads the
// source and requires a real description there, not an identifier that could
// resolve to anything.
const DESCRIPTION = metadata.description ?? ''

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
 *
 * TWO CONTENT MODULES, ON PURPOSE. `@/content/about` is the existing mechanical
 * description of how a coupon behaves, and it is unchanged. `./_content/trust`
 * is the story, the vision and the price explanation, and it is scoped to this
 * route because it is shared with the two pages under it and with nothing else.
 * The date shown is the later of the two, so a reader is never told the page is
 * older than the newest paragraph on it.
 */
export default function AboutPage() {
  const updatedAt = TRUST_UPDATED_AT > ABOUT_UPDATED_AT ? TRUST_UPDATED_AT : ABOUT_UPDATED_AT
  const updated = new Date(updatedAt).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <AboutJsonLd path="/about" name="אודות קניון אקספרס" description={DESCRIPTION} />

      <AboutBreadcrumb />

      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">אודות קניון אקספרס</h1>
        <p className="mt-2 text-sm text-heading/75">עודכן לאחרונה: {updated}</p>
        <p className="mt-4 text-base leading-relaxed text-heading/80">{aboutLede}</p>
      </header>

      <AboutNav current="/about" />

      <div className="max-w-3xl space-y-8">
        {aboutStory.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-semibold text-heading">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-base leading-relaxed text-heading/80">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        {/* The price section gets a tinted frame because it is the one section
            on the page a shopper came for, and because its last paragraph says
            what we do NOT claim. Burying that in a run of identical sections is
            how a disclaimer stops being read. */}
        <section className="rounded-xl border border-heading/10 bg-brand-accent/40 p-5">
          <h2 className="text-xl font-semibold text-heading">{whyItIsCheap.heading}</h2>
          {whyItIsCheap.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-3 text-base leading-relaxed text-heading/80">
              {paragraph}
            </p>
          ))}
        </section>

        <section>
          <h2 className="text-xl font-semibold text-heading">להמשך קריאה</h2>
          <p className="mt-3 text-base leading-relaxed text-heading/80">
            הסבר מלא על מסלול הרכישה, בשלושה צעדים לקונה ושלושה לבית העסק, נמצא בעמוד{' '}
            <Link
              href="/about/how-it-works"
              className="font-medium text-heading underline underline-offset-2"
            >
              איך זה עובד
            </Link>
            . מה שקורה לכסף מרגע התשלום, כולל מה שאין כאן, מוסבר בעמוד{' '}
            <Link
              href="/about/payment-security"
              className="font-medium text-heading underline underline-offset-2"
            >
              אבטחת תשלומים
            </Link>
            .
          </p>
        </section>

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
