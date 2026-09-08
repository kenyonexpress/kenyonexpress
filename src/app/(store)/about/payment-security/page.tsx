import type { Metadata } from 'next'
import Link from 'next/link'
import AboutBreadcrumb from '../_components/AboutBreadcrumb'
import AboutJsonLd from '../_components/AboutJsonLd'
import AboutNav from '../_components/AboutNav'
import { TRUST_UPDATED_AT, paymentLede, paymentSections } from '../_content/trust'

/**
 * What happens to the money, said plainly.
 *
 * THE ESCROW SECTION IS THE REASON THIS PAGE EXISTS, and it says there is no
 * escrow here. That is not a hedge. The model was decided on 2026-07-28 and is
 * pinned by `src/lib/supplier/no-escrow-in-supplier-due.test.ts`: a coupon
 * prepayment is settled at payment time, nothing is held and nothing is
 * released on a scan. A trust page that implied otherwise would be making, in
 * the most legally exposed sentence a marketplace can write, a claim the
 * codebase contradicts, and the customer would discover it during a dispute.
 * So the section defines the term, states the position, and gives the reason,
 * and the section after it lists the protections that do exist.
 *
 * NO SECURITY DETAIL THAT IS ONLY TRUE OF A CONFIGURATION. There is no claim
 * about 3-D Secure, because whether a given transaction gets a challenge is the
 * card scheme's call and this repository does not decide it. What is claimed is
 * what the code does: the card is entered on the processor's page, only a token
 * comes back, and every callback is re-verified server to server before a
 * voucher is issued.
 */
export const metadata: Metadata = {
  title: 'אבטחת תשלומים',
  description:
    'מה קורה לכסף שלכם בקניון אקספרס: סליקה דרך Cardcom בלי שמירת מספרי כרטיס אצלנו, אימות כל תשלום מול חברת הסליקה, מה זו נאמנות (escrow) ולמה אין כאן כזו, וההגנות שכן קיימות.',
  alternates: { canonical: '/about/payment-security' },
}

// One sentence, one place. `Metadata['description']` is `string | null`, so it
// is narrowed here once rather than cast at the JSON-LD call. The literal stays
// inside the metadata object because `src/app/content-pages.test.ts` reads the
// source and requires a real description there, not an identifier that could
// resolve to anything.
const DESCRIPTION = metadata.description ?? ''

export default function PaymentSecurityPage() {
  const updated = new Date(TRUST_UPDATED_AT).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <AboutJsonLd path="/about/payment-security" name="אבטחת תשלומים" description={DESCRIPTION} />

      <AboutBreadcrumb current="אבטחת תשלומים" />

      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">אבטחת תשלומים</h1>
        <p className="mt-2 text-sm text-heading/75">עודכן לאחרונה: {updated}</p>
        <p className="mt-4 text-base leading-relaxed text-heading/80">{paymentLede}</p>
      </header>

      <AboutNav current="/about/payment-security" />

      <div className="max-w-3xl space-y-8">
        {paymentSections.map((section) => (
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
          <h2 className="text-lg font-semibold text-heading">המסמכים המחייבים</h2>
          <p className="mt-2 text-base leading-relaxed text-heading/80">
            העמוד הזה מסביר. מה שמחייב משפטית הוא{' '}
            <Link
              href="/terms-and-conditions"
              className="font-medium text-heading underline underline-offset-2"
            >
              התקנון
            </Link>
            ,{' '}
            <Link
              href="/refund_returns"
              className="font-medium text-heading underline underline-offset-2"
            >
              מדיניות הביטולים וההחזרות
            </Link>{' '}
            ו
            <Link
              href="/privacy-policy"
              className="font-medium text-heading underline underline-offset-2"
            >
              מדיניות הפרטיות
            </Link>
            . במקרה של סתירה, המסמכים האלה גוברים על הניסוח כאן.
          </p>
          <p className="mt-3 text-base leading-relaxed text-heading/80">
            שאלה שלא נענתה כאן? יש{' '}
            <Link href="/faq" className="font-medium text-heading underline underline-offset-2">
              שאלות נפוצות
            </Link>{' '}
            ואפשר גם{' '}
            <Link href="/contact" className="font-medium text-heading underline underline-offset-2">
              לפנות אלינו
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  )
}
