import ContactChannelList from '@/components/contact/ContactChannelList'
import RichText from '@/components/content/RichText'
import ContactForm from '@/components/storefront/ContactForm'
import { contactEmail } from '@/lib/contact-address'
import { topicsFor } from '@/lib/contact/channels'
import { excerpt } from '@/lib/content/markup'
import { getBoundContentPage } from '@/lib/content/read'
import { t } from '@/lib/i18n/messages'
import { formatIsraeliPhoneDisplay, storeWhatsAppLink, storeWhatsAppNumber } from '@/lib/whatsapp'
import { listActiveContactChannels } from '@/server/contact/channels'
import type { Metadata } from 'next'
import Link from 'next/link'

export async function generateMetadata(): Promise<Metadata> {
  const page = await getBoundContentPage('contact')
  return {
    title: page.seoTitle ?? page.title,
    description:
      page.seoDescription ?? (page.body.kind === 'prose' ? excerpt(page.body.markup) : page.title),
    alternates: { canonical: '/contact' },
  }
}

/**
 * Minimal contact page. Real inbox routing is CONTACT_TO (default
 * support@kenyonexpress.co.il, via `contactEmail()`). Legal terms stay a
 * separate content task.
 *
 * THE CMS OWNS THE INTRODUCTION AND NOTHING ELSE. The paragraph below it is
 * built from `lib/whatsapp`, and that is deliberate: [68] already fixed a page
 * whose link dialled a different number than the one it printed, and the fix
 * was to derive both from one function. Putting that sentence in a text box
 * would hand the drift straight back.
 */
export default async function ContactPage() {
  const page = await getBoundContentPage('contact')
  const waHref = storeWhatsAppLink('שלום, יש לי שאלה לקניון אקספרס')
  const storeNumber = storeWhatsAppNumber()
  const waDisplay = formatIsraeliPhoneDisplay(storeNumber)
  // Section 94: one topic per kind of question, each with its own opener and
  // (when the operator set one) its own number. Table or code defaults.
  const topics = topicsFor(await listActiveContactChannels(), storeNumber)

  // The root is a <div>, not a <main>: the (store) layout already wraps the
  // page in the document's one <main>, and this page nested a second (S34).
  return (
    <div className="mx-auto w-full max-w-page px-4 py-10">
      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">צור קשר</span>
      </nav>

      <header className="mb-8 max-w-xl">
        <h1 className="text-3xl font-bold text-heading">{page.title}</h1>
        {page.body.kind === 'prose' && <RichText markup={page.body.markup} />}
        <p className="mt-3 text-base leading-relaxed text-heading/80">
          {/* Number and printed label both come from lib/whatsapp ([68]): the
              literal href here and the literal digits under it could drift
              apart, and a page whose link dials a different number than the one
              it prints is the worst of the two. */}
          {waHref && (
            <>
              אפשר גם בוואטסאפ{' '}
              <a
                href={waHref}
                className="font-medium text-heading underline underline-offset-2"
                dir="ltr"
              >
                {waDisplay}
              </a>
            </>
          )}{' '}
          או במייל{' '}
          <a
            href={`mailto:${contactEmail()}`}
            className="font-medium text-heading underline underline-offset-2"
            dir="ltr"
          >
            {contactEmail()}
          </a>
          .
        </p>
      </header>

      {/* S34: every channel on the page, not one behind a dropdown. The
          picker stays in the floating sheet, where there is no room for five
          cards; the reasoning is on ContactChannelList. */}
      {topics.length > 0 && (
        <section aria-labelledby="contact-channels-heading" className="mb-10">
          <h2 id="contact-channels-heading" className="text-xl font-bold text-heading">
            {t('contact.channelsHeading')}
          </h2>
          <p className="mb-4 mt-1 text-sm leading-relaxed text-heading/80">
            {t('contact.channelsIntro')}
          </p>
          <ContactChannelList channels={topics} />
        </section>
      )}

      <ContactForm />
    </div>
  )
}
