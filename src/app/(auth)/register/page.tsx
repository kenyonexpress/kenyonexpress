import type { Metadata } from 'next'
import { Suspense } from 'react'
import AuthFrame, { AuthAside } from '../AuthFrame'
import SignupForm from '../signup/SignupForm'

/**
 * V04: /register is WooCommerce's name for the page, and the one the queue and
 * the Electro reference use. It renders the same form as /signup, which stays
 * because every existing link (header menu, emails, `next` round-trips) points
 * there. Noindex with a SELF canonical, as /login explains: noindex beside a
 * canonical that names another url is a contradiction Google settles by
 * following the canonical.
 */
export const metadata: Metadata = {
  title: 'הרשמה',
  robots: { index: false, follow: true },
  alternates: { canonical: '/register' },
}

// No form in the fallback, for the same reason as /signup: a second render of the form is
// a remount, and a remount loses what has been typed into it. The fallback is an
// empty box, not a form, holding the footer below the fold (V08, see /login).
export default function RegisterPage(props: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense fallback={<div className="auth-page__pending" aria-hidden="true" />}>
      <RegisterPageBody {...props} />
    </Suspense>
  )
}

async function RegisterPageBody({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return (
    <AuthFrame aside={<AuthAside mode="toLogin" next={next} />}>
      <SignupForm next={next} />
    </AuthFrame>
  )
}
