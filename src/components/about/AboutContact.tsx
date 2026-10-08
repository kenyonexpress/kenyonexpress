import WhatsAppSupportButton from '@/components/help/WhatsAppSupportButton'
import { SUPPORT_HOURS_ROWS } from '@/lib/support-hours'
import Link from 'next/link'

/** The pre-filled WhatsApp text for a question that starts on the about page. */
const ABOUT_WHATSAPP_TEXT = 'שלום, הגעתי מעמוד האודות ויש לי שאלה על קניון אקספרס'

/**
 * How to reach us, on the about page (STEP 53).
 *
 * The same three sources as `/contact`: the number through `lib/whatsapp`,
 * the address through `lib/contact-address` (passed in), the hours through
 * `lib/support-hours`. Nothing is retyped, so this card and the contact page
 * cannot disagree. No "open now" badge here: that is the contact page's job,
 * and this card links to it.
 */
export default function AboutContact({ email }: { email: string }) {
  return (
    <section
      aria-labelledby="about-contact"
      className="rounded-xl border border-heading/15 bg-heading/5 p-5"
    >
      <h2 id="about-contact" className="text-lg font-bold text-heading">
        איך מגיעים אלינו
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <WhatsAppSupportButton text={ABOUT_WHATSAPP_TEXT} />
        <a
          href={`mailto:${email}`}
          dir="ltr"
          className="inline-flex min-h-12 items-center rounded-xl border border-heading/20 bg-white px-5 py-3 text-base font-medium text-heading hover:border-heading/40"
        >
          {email}
        </a>
      </div>

      <h3 className="mt-6 text-base font-bold text-heading">שעות מענה, לפי שעון ישראל</h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-base text-heading/85">
        {SUPPORT_HOURS_ROWS.map((row) => (
          <div key={row.label} className="contents">
            <dt className="font-medium text-heading">{row.label}</dt>
            <dd className="tabular-nums">{row.hours}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-sm text-heading/75">
        טופס פנייה, ומה לצפות אחרי שכתבתם, בעמוד{' '}
        <Link href="/contact" className="font-medium text-heading underline underline-offset-2">
          צור קשר
        </Link>
        .
      </p>
    </section>
  )
}
