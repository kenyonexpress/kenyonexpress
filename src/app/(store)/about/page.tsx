import AboutContact from '@/components/about/AboutContact'
import AboutPress from '@/components/about/AboutPress'
import AboutTeam from '@/components/about/AboutTeam'
import {
  ABOUT_UPDATED_AT,
  aboutIntro,
  aboutMission,
  aboutSections,
  aboutStory,
  aboutTeam,
  pressMentions,
} from '@/content/about'
import { contactEmail } from '@/lib/contact-address'
import { buildAboutJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { publicPageMetadata } from '@/lib/seo/page-metadata'
import { siteUrl } from '@/lib/site-url'
import { storeWhatsAppNumber } from '@/lib/whatsapp'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = publicPageMetadata({
  title: 'אודות',
  description:
    'מי עומד מאחורי קניון אקספרס, מה המשימה שלנו, איך התחלנו, וכיצד עובדת רכישת קופון: תשלום מקדים, שובר עם QR, יתרה בבית העסק וזיכוי אוטומטי בפקיעה.',
  path: '/about',
})

/**
 * The about page (STEP 53).
 *
 * Structure and spacing are copied from `/faq`, which was itself measured
 * against the live template: the same `max-w-page` frame, the same breadcrumb,
 * the same `max-w-3xl` measure for body text. A new marketing page with its own
 * rhythm is exactly what the comparison gate exists to catch, and matching an
 * existing page is cheaper than defending a new one.
 *
 * In reading order: mission, story, team, how it works (the sections that
 * were here before), press, contact, and the supplier call to action. The
 * content is a typed module rather than JSX, for the reason
 * `content/legal/faq.ts` gives: what the site claims about itself has to be
 * reviewable in one file, not spread through markup. Every address and
 * number comes from its one source, as on `/contact`.
 *
 * Static. Nothing here reads a clock or a cookie.
 */
export default function AboutPage() {
  const email = contactEmail()
  const jsonLd = buildAboutJsonLd({
    siteUrl: siteUrl(),
    email,
    phoneIntl: storeWhatsAppNumber(),
    team: aboutTeam,
  })
  const updated = new Date(ABOUT_UPDATED_AT).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
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
        <span className="text-heading">אודות</span>
      </nav>

      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">אודות קניון אקספרס</h1>
        <p className="mt-2 text-sm text-heading/75">עודכן לאחרונה: {updated}</p>
        <p className="mt-4 text-base leading-relaxed text-heading/80">{aboutIntro}</p>
      </header>

      <div className="max-w-3xl space-y-8">
        {[aboutMission, aboutStory].map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-semibold text-heading">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-base leading-relaxed text-heading/80">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <AboutTeam members={aboutTeam} />

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

        <AboutPress mentions={pressMentions} email={email} />

        <AboutContact email={email} />

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
    </div>
  )
}
