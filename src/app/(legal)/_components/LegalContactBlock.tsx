import { formatIsraeliPhoneDisplay, storeWhatsAppLink, storeWhatsAppNumber } from '@/lib/whatsapp'
import Link from 'next/link'

export const LEGAL_CONTACT_EMAIL = 'info@kenyonexpress.co.il'

/**
 * The one place a legal page prints how to reach us.
 *
 * The number is NOT written into the document text. It comes from
 * `lib/whatsapp`, which is the single source for the store's number ([68]), so
 * four legal documents cannot drift onto four different phone numbers, and a
 * page whose printed digits differ from the number its link dials is the worst
 * of the two. The email is a constant here and is exported, so the pages that
 * name it in a clause use the same literal.
 */
export default function LegalContactBlock({
  heading = 'יצירת קשר',
  intro,
}: {
  heading?: string
  intro: string
}) {
  const waHref = storeWhatsAppLink('שלום, יש לי שאלה בנוגע למסמכים המשפטיים באתר')
  const waDisplay = formatIsraeliPhoneDisplay(storeWhatsAppNumber())

  return (
    <section
      aria-labelledby="legal-contact"
      className="mt-10 rounded-xl border border-heading/15 bg-heading/5 p-5"
    >
      <h2 id="legal-contact" className="text-lg font-bold text-heading">
        {heading}
      </h2>
      <p className="mt-2 text-base leading-relaxed text-heading/85">{intro}</p>
      <ul className="mt-3 space-y-2 text-base text-heading/85">
        <li>
          דואר אלקטרוני:{' '}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="font-medium text-heading underline underline-offset-4"
            dir="ltr"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
        </li>
        {waHref && waDisplay && (
          <li>
            וואטסאפ:{' '}
            <a
              href={waHref}
              className="font-medium text-heading underline underline-offset-4"
              dir="ltr"
            >
              {waDisplay}
            </a>
          </li>
        )}
        <li>
          טופס מקוון:{' '}
          <Link href="/contact" className="font-medium text-heading underline underline-offset-4">
            עמוד צור קשר
          </Link>
        </li>
        <li>כתובת האתר: www.kenyonexpress.co.il</li>
      </ul>
    </section>
  )
}
