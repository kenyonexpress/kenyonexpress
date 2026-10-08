import SupportHours from '@/components/contact/SupportHours'
import WhatsAppSupportButton from '@/components/help/WhatsAppSupportButton'
import ContactForm from '@/components/storefront/ContactForm'
import { contactEmail } from '@/lib/contact-address'
import { buildContactJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { publicPageMetadata } from '@/lib/seo/page-metadata'
import { siteUrl } from '@/lib/site-url'
import { supportOpeningHoursSpecification } from '@/lib/support-hours'
import { storeWhatsAppNumber } from '@/lib/whatsapp'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = publicPageMetadata({
  title: 'צור קשר',
  description:
    'צרו קשר עם קניון אקספרס בוואטסאפ, במייל או בטופס: שעות המענה לפי שעון ישראל וזמן החזרה הצפוי.',
  path: '/contact',
})

/** The pre-filled WhatsApp text for a question that starts on this page. */
const CONTACT_WHATSAPP_TEXT = 'שלום, יש לי שאלה לקניון אקספרס'

/**
 * The contact page (STEP 52).
 *
 * In the order a person with a question reads it: the fastest way to a human
 * (WhatsApp, then email), the form, and beside it the hours a person answers
 * and what to expect after writing. Every number and address comes from its
 * one source (`lib/whatsapp`, `lib/contact-address`, `lib/support-hours`),
 * so the link, the printed digits, the table and the `ContactPoint` below
 * cannot drift apart.
 *
 * The page is static. The only clock read is the "open now" badge, in the
 * browser after mount, so the prerender carries no frozen timestamp.
 */
export default function ContactPage() {
  const email = contactEmail()
  const jsonLd = buildContactJsonLd({
    siteUrl: siteUrl(),
    email,
    phoneIntl: storeWhatsAppNumber(),
    hoursAvailable: supportOpeningHoursSpecification(),
  })

  return (
    <div className="mx-auto w-full max-w-page px-4 py-10">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point; jsonLdScript escapes every angle bracket, and the content is built from this repo's own constants.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">צור קשר</span>
      </nav>

      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">צור קשר</h1>
        <p className="mt-3 text-base leading-relaxed text-heading/80">
          יש שאלה על הזמנה, קופון או משלוח? הדרך המהירה היא וואטסאפ. אפשר גם במייל או בטופס למטה,
          ונחזור אליכם.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <WhatsAppSupportButton text={CONTACT_WHATSAPP_TEXT} />
          <a
            href={`mailto:${email}`}
            dir="ltr"
            className="inline-flex min-h-12 items-center rounded-xl border border-heading/20 bg-white px-5 py-3 text-base font-medium text-heading hover:border-heading/40"
          >
            {email}
          </a>
        </div>
      </header>

      <div className="grid max-w-5xl gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start">
        <section aria-labelledby="contact-form-title" className="max-w-3xl">
          <h2 id="contact-form-title" className="mb-4 text-xl font-bold text-heading">
            שלחו לנו הודעה
          </h2>
          <ContactForm />
        </section>

        <SupportHours />
      </div>

      <p className="mt-10 max-w-3xl text-sm text-heading/75">
        שאלה על הזמנה קיימת? במרכז העזרה יש תשובות לפי נושא וטופס שכבר מכיר את ההזמנה:{' '}
        <Link href="/help" className="font-medium text-heading underline underline-offset-2">
          מרכז העזרה
        </Link>
        .
      </p>
    </div>
  )
}
