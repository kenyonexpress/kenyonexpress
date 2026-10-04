import { contactEmail } from '@/lib/contact-address'
import { t } from '@/lib/i18n/messages'
import Link from 'next/link'

/**
 * The one place a legal page prints who we are and how to reach us.
 *
 * THE ENTITY LINE IS THE OWNER'S, VERBATIM: "קניון אקספרס, עוסק מורשה". A
 * legal document without the operator's legal form is incomplete
 * (docs/legal/README.md, open question 7), and it was missing from all four
 * documents until W02 (05.10.2026). The registration number is still the
 * owner's to supply; the line says what it can say truthfully today.
 *
 * NO PHONE, AND NO WhatsApp EITHER. Owner policy since 22.09.2026 (OWNER
 * DECISIONS v2, customer service): support is written, through the email
 * address and the contact form, and the storefront prints no number to call.
 * Until W02 this block still printed the WhatsApp number under the heading
 * "יצירת קשר", which is a phone number by any reading a regulator would give
 * it, and the accessibility statement promised help "בטלפון". Both are gone.
 *
 * The email reads `contactEmail()`, the single source `contact-address.ts`
 * already gives the contact form and the cron digest, so the address moves in
 * one place instead of five.
 */
export default function LegalContactBlock({
  heading,
  intro,
}: {
  heading?: string
  intro: string
}) {
  const email = contactEmail()
  const title = heading ?? t('legal.contact.heading')

  return (
    <section aria-labelledby="legal-contact" className="legal-contact">
      <h2 id="legal-contact" className="legal-contact__title">
        {title}
      </h2>
      <p className="legal-contact__entity">
        {t('legal.contact.operatorLabel')} <strong>{t('legal.contact.operator')}</strong>
      </p>
      <p className="legal-contact__intro">{intro}</p>
      <ul className="legal-contact__channels">
        <li>
          {t('legal.contact.email')}{' '}
          <a href={`mailto:${email}`} className="legal-contact__link" dir="ltr">
            {email}
          </a>
        </li>
        <li>
          {t('legal.contact.form')}{' '}
          <Link href="/contact" className="legal-contact__link">
            {t('legal.contact.formLink')}
          </Link>
        </li>
        <li>{t('legal.contact.site')}</li>
        <li>{t('legal.contact.writtenOnly')}</li>
      </ul>
    </section>
  )
}
