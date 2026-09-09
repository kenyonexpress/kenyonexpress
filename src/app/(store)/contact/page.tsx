import RichText from '@/components/content/RichText'
import ContactForm from '@/components/storefront/ContactForm'
import { excerpt } from '@/lib/content/markup'
import { getBoundContentPage } from '@/lib/content/read'
import { formatIsraeliPhoneDisplay, storeWhatsAppLink, storeWhatsAppNumber } from '@/lib/whatsapp'
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
 * info@kenyonexpress.co.il). Legal terms stay a separate content task.
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
  const waDisplay = formatIsraeliPhoneDisplay(storeWhatsAppNumber())

  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
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
            href="mailto:info@kenyonexpress.co.il"
            className="font-medium text-heading underline underline-offset-2"
            dir="ltr"
          >
            info@kenyonexpress.co.il
          </a>
          .
        </p>
      </header>

      <ContactForm />
    </main>
  )
}
