import type { Metadata } from 'next'
import { Suspense } from 'react'
import SignupForm from './SignupForm'

/**
 * NOINDEX, and the canonical is the reason rather than the crawl budget. The root
 * layout declares `alternates.canonical: '/'` and Next inherits metadata, so a
 * page that sets neither tells Google it IS the home page - measured 2026-09-10
 * on sixteen public routes, this one among them.
 */
export const metadata: Metadata = {
  title: 'הרשמה — KenyonExpress',
  robots: { index: false, follow: true },
  // A SELF-CANONICAL BESIDE THE NOINDEX, and the pair is deliberate. Without it
  // this page inherits the root layout's canonical of '/', and noindex plus a
  // canonical pointing at ANOTHER url is a contradiction Google resolves by
  // following the canonical - which would aim the noindex at the home page. The
  // same url in both fields says exactly one thing: do not index this, and it
  // stands for nothing else.
  alternates: { canonical: '/signup' },
}

// Null fallback for the same reason as /login: a second render of the form is a
// remount, and a remount loses what has been typed into it.
export default function SignupPage(props: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense fallback={null}>
      <SignupPageBody {...props} />
    </Suspense>
  )
}

async function SignupPageBody({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return <SignupForm next={next} />
}
