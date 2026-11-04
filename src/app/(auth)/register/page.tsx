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

// Null fallback for the same reason as /signup: a second render of the form is
// a remount, and a remount loses what has been typed into it.
export default function RegisterPage(props: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense fallback={null}>
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
