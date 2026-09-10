import GiftCardRedeemForm from '@/components/storefront/GiftCardRedeemForm'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

export const metadata: Metadata = {
  title: 'מימוש גיפט קארד',
  description: 'בדיקת יתרה ומימוש גיפט קארד של קניון אקספרס: הקוד נטען לארנק ומשמש בכל רכישה.',
  alternates: { canonical: '/gift-card' },
}

/**
 * The landing page of the code printed in the gift card email.
 *
 * Two verbs, one field each: balance check (open to anyone holding a code) and
 * redemption (needs a session, because it credits a wallet). The form decides
 * which to show; this page only answers whether a session exists so the form
 * can offer login instead of failing after the fact.
 *
 * The shell prerenders; the session read lives inside `<Suspense>`, same as
 * `gift/[token]/page.tsx` — uncached data outside a boundary fails the build.
 */
export default function GiftCardPage() {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">גיפט קארד</span>
      </nav>

      <header className="mb-8 max-w-xl">
        <h1 className="text-3xl font-bold text-heading">מימוש גיפט קארד</h1>
        <p className="mt-3 text-base leading-relaxed text-heading/80">
          קיבלתם גיפט קארד? מזינים כאן את הקוד מהמייל, הסכום נטען לארנק שלכם ומשמש לתשלום בכל רכישה
          באתר. אפשר גם רק לבדוק יתרה, בלי לממש.
        </p>
      </header>

      <Suspense fallback={<p className="text-sm text-heading/75">רגע, בודקים את החשבון…</p>}>
        <RedeemSection />
      </Suspense>
    </main>
  )
}

async function RedeemSection() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return <GiftCardRedeemForm signedIn={Boolean(user)} />
}
