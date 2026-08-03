import ContactForm from '@/components/storefront/ContactForm'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'צור קשר',
  description: 'צרו קשר עם קניון אקספרס: שאלות, הצעות והערות על קופונים, הזמנות ומשלוחים.',
  alternates: { canonical: '/contact' },
}

/**
 * Minimal contact page. Real inbox routing is CONTACT_TO (default
 * info@kenyonexpress.co.il). Legal terms stay a separate content task.
 */
export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/70">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">צור קשר</span>
      </nav>

      <header className="mb-8 max-w-xl">
        <h1 className="text-3xl font-bold text-heading">צור קשר</h1>
        <p className="mt-3 text-base leading-relaxed text-heading/80">
          יש שאלה על הזמנה, קופון או משלוח? שלחו הודעה ונחזור אליכם. אפשר גם בוואטסאפ{' '}
          <a
            href="https://wa.me/972524635550"
            className="font-medium text-heading underline underline-offset-2"
            dir="ltr"
          >
            052-463-5550
          </a>{' '}
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
