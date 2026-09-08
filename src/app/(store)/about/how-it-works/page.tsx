import type { Metadata } from 'next'
import Link from 'next/link'
import AboutBreadcrumb from '../_components/AboutBreadcrumb'
import AboutJsonLd from '../_components/AboutJsonLd'
import AboutNav from '../_components/AboutNav'
import StepFlow from '../_components/StepFlow'
import {
  TRUST_UPDATED_AT,
  buyerSteps,
  buyerStepsLede,
  supplierSteps,
  supplierStepsLede,
} from '../_content/trust'

/**
 * How it works, from both sides of the counter.
 *
 * ONE PAGE AND NOT TWO. The buyer's third step and the supplier's third step
 * are the same event seen twice, the scan, and splitting them puts a customer
 * who wonders "what does the restaurant actually get" on a page they will never
 * find. Two `<section>`s under one `<h1>` say that they are one story.
 *
 * The frame is `/faq`'s, for the reason `about/page.tsx` gives, and
 * `src/app/content-pages.test.ts` asserts it.
 */
export const metadata: Metadata = {
  title: 'איך זה עובד',
  description:
    'איך קונים ואיך מוכרים בקניון אקספרס: שלושה צעדים לקונה, מבחירת הדיל ועד סריקת ה QR בבית העסק, ושלושה צעדים לבית העסק, מההצטרפות ועד קבלת חלקו בתשלום.',
  alternates: { canonical: '/about/how-it-works' },
}

// One sentence, one place. `Metadata['description']` is `string | null`, so it
// is narrowed here once rather than cast at the JSON-LD call. The literal stays
// inside the metadata object because `src/app/content-pages.test.ts` reads the
// source and requires a real description there, not an identifier that could
// resolve to anything.
const DESCRIPTION = metadata.description ?? ''

export default function HowItWorksPage() {
  const updated = new Date(TRUST_UPDATED_AT).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <AboutJsonLd path="/about/how-it-works" name="איך זה עובד" description={DESCRIPTION} />

      <AboutBreadcrumb current="איך זה עובד" />

      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">איך זה עובד</h1>
        <p className="mt-2 text-sm text-heading/75">עודכן לאחרונה: {updated}</p>
      </header>

      <AboutNav current="/about/how-it-works" />

      <section aria-labelledby="buyer-steps" className="mb-12">
        <h2 id="buyer-steps" className="text-2xl font-semibold text-heading">
          לקונה
        </h2>
        <p className="mt-2 max-w-3xl text-base leading-relaxed text-heading/80">{buyerStepsLede}</p>
        <StepFlow steps={buyerSteps} ariaLabel="שלושת הצעדים לקונה" />
      </section>

      <section aria-labelledby="supplier-steps">
        <h2 id="supplier-steps" className="text-2xl font-semibold text-heading">
          לבית העסק
        </h2>
        <p className="mt-2 max-w-3xl text-base leading-relaxed text-heading/80">
          {supplierStepsLede}
        </p>
        <StepFlow steps={supplierSteps} ariaLabel="שלושת הצעדים לבית העסק" />
      </section>

      <section className="mt-12 max-w-3xl rounded-xl border border-heading/10 bg-brand-accent/40 p-5">
        <h2 className="text-lg font-semibold text-heading">מה קורה לכסף בדרך</h2>
        <p className="mt-2 text-base leading-relaxed text-heading/80">
          הצעד השני בכל אחד משני המסלולים הוא תשלום, ולכן הוא זה שיש עליו הכי הרבה מה לומר. ההסבר
          המלא, כולל היכן מוקלד הכרטיס ומה בדיוק נשמר אצלנו, נמצא בעמוד{' '}
          <Link
            href="/about/payment-security"
            className="font-medium text-heading underline underline-offset-2"
          >
            אבטחת תשלומים
          </Link>
          .
        </p>
        <Link
          href="/suppliers"
          className="mt-4 inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-heading"
        >
          הצטרפות כספק
        </Link>
      </section>
    </main>
  )
}
