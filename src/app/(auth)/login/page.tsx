import { phoneAuthEnabled } from '@/lib/auth/phone-otp'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import LoginForm from './LoginForm'

export const metadata: Metadata = { title: 'כניסה — KenyonExpress' }

/**
 * The fallback is null rather than a copy of the form at its defaults, and that
 * is deliberate: swapping a rendered `<LoginForm>` for another one remounts it
 * and throws away anything already typed. `searchParams` resolves off the
 * request with no I/O behind it, so this hole is filled in the same flush that
 * carries the shell.
 */
export default function LoginPage(props: {
  searchParams: Promise<{ next?: string; error?: string; magic?: string }>
}) {
  return (
    <Suspense fallback={null}>
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
    <LoginForm next={next} callbackError={error} magic={magic} phoneEnabled={phoneAuthEnabled()} />
  )
}
