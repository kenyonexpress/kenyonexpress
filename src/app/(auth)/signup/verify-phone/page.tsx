import { toE164Israeli } from '@/lib/auth/phone-otp'
import { safeNextPath } from '@/lib/auth/safe-next'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import VerifyPhoneForm from './VerifyPhoneForm'

export const metadata: Metadata = {
  title: 'אימות מספר הטלפון — KenyonExpress',
  robots: { index: false, follow: false },
}

type Params = { phone?: string; next?: string }

// Null fallback for the same reason as /signup: a remount loses the digits
// the customer is in the middle of typing.
export default function VerifyPhonePage(props: { searchParams: Promise<Params> }) {
  return (
    <Suspense fallback={null}>
      <VerifyPhonePageBody {...props} />
    </Suspense>
  )
}

async function VerifyPhonePageBody({ searchParams }: { searchParams: Promise<Params> }) {
  const { phone, next } = await searchParams
  // The number is display and the verify action's lookup key, nothing more:
  // the user it binds to comes from the challenge on the server. A URL with
  // no usable number has nothing to verify.
  const e164 = toE164Israeli(phone)
  if (!e164) redirect('/signup')
  const safeNext = safeNextPath(next)
  return <VerifyPhoneForm phone={e164} next={safeNext === '/' ? undefined : safeNext} />
}
