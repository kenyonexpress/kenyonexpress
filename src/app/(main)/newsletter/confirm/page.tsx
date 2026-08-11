import { confirmNewsletter } from '@/server/actions/newsletter'
import { Suspense } from 'react'

export const metadata = { title: 'אישור הרשמה', robots: { index: false, follow: false } }

/**
 * The outcome is a write keyed by a token in the URL, so none of it is
 * prerenderable. The frame is, and the frame is what decides where the heading
 * sits, so the wait costs no layout shift.
 */
export default function ConfirmPage(props: { searchParams: Promise<{ token?: string }> }) {
  return (
    <Suspense
      fallback={
        <main dir="rtl" className="mx-auto max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold">מאשרים את ההרשמה...</h1>
        </main>
      }
    >
      <ConfirmPageBody {...props} />
    </Suspense>
  )
}

async function ConfirmPageBody({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const result = await confirmNewsletter(token ?? '')

  return (
    <main dir="rtl" className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-bold">{result.ok ? 'ההרשמה אושרה' : 'לא הצלחנו לאשר'}</h1>
      <p className="mt-3 text-gray-600">{result.message ?? result.error}</p>
      <a href="/" className="mt-6 inline-block underline">
        חזרה לחנות
      </a>
    </main>
  )
}
