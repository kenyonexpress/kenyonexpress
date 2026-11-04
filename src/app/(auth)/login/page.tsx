import { phoneAuthEnabled } from '@/lib/auth/phone-otp'
import { otpChannel } from '@/lib/auth/whatsapp-cloud'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import AuthFrame, { AuthAside } from '../AuthFrame'
import LoginForm from './LoginForm'

/**
 * NOINDEX, and the canonical is the reason rather than the crawl budget. The root
 * layout declares `alternates.canonical: '/'` and Next inherits metadata, so a
 * page that sets neither tells Google it IS the home page - measured 2026-09-10
 * on sixteen public routes, this one among them.
 */
export const metadata: Metadata = {
  // The root template appends the site name.
  title: 'כניסה',
  robots: { index: false, follow: true },
  // A SELF-CANONICAL BESIDE THE NOINDEX, and the pair is deliberate. Without it
  // this page inherits the root layout's canonical of '/', and noindex plus a
  // canonical pointing at ANOTHER url is a contradiction Google resolves by
  // following the canonical - which would aim the noindex at the home page. The
  // same url in both fields says exactly one thing: do not index this, and it
  // stands for nothing else.
  alternates: { canonical: '/login' },
}

/**
 * The fallback is null rather than a copy of the form at its defaults, and that
 * is deliberate: swapping a rendered `<LoginForm>` for another one remounts it
 * and throws away anything already typed. `searchParams` resolves off the
 * request with no I/O behind it, so this hole is filled in the same flush that
 * carries the shell.
 *
 * Not quite null (V08): on a slow link the shell paints before that flush
 * lands, and with nothing in the hole the footer was drawn under the header
 * and then pushed off the screen by the form, CLS 0.41 on Lighthouse mobile
 * with devtools throttling. The fallback is an empty box that holds a screen
 * of height, never a form, so nothing typed can be lost to it.
 */
export default function LoginPage(props: {
  searchParams: Promise<{ next?: string; error?: string; magic?: string }>
}) {
  return (
    <Suspense fallback={<div className="auth-page__pending" aria-hidden="true" />}>
      <LoginPageBody {...props} />
    </Suspense>
  )
}

async function LoginPageBody({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; magic?: string }>
}) {
  const { next, error, magic } = await searchParams
  // Read on the server so the switch is one variable, not two that can
  // disagree: a NEXT_PUBLIC copy would be inlined at build time and would keep
  // showing the option after the provider was turned off.
  return (
    <AuthFrame aside={<AuthAside mode="toRegister" next={next} />}>
      <LoginForm
        next={next}
        callbackError={error}
        magic={magic}
        phoneEnabled={phoneAuthEnabled()}
        otpChannel={otpChannel()}
      />
    </AuthFrame>
  )
}
