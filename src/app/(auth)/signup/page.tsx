import RegisterPanel from '@/components/auth/RegisterPanel'
import type { Metadata } from 'next'
import { Suspense } from 'react'

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

/**
 * The card around the register stepper (UX24). The stepper itself,
 * `components/auth/RegisterPanel`, is the same body the auth dialog shows
 * over the storefront, so the page and the dialog cannot drift.
 */
async function SignupPageBody({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-semibold mb-4">יצירת חשבון</h2>
      <RegisterPanel next={next} variant="page" />
    </div>
  )
}
