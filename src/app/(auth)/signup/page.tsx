import type { Metadata } from 'next'
import { Suspense } from 'react'
import SignupForm from './SignupForm'

export const metadata: Metadata = { title: 'הרשמה — KenyonExpress' }

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
