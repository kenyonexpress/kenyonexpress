import { unsubscribeByToken } from '@/server/actions/newsletter'
import { Suspense } from 'react'

export const metadata = { title: 'הסרה מרשימת הדיוור', robots: { index: false, follow: false } }

/**
 * One click, no login.
 *
 * The unsubscribe happens on load rather than behind a confirm button, because
 * RFC 8058 one-click requires the link in the header to work without further
 * interaction, and because every extra step here is a person pressing the spam
 * button instead.
 *
 * The heading is the same in both outcomes, so it goes in the shell and only the
 * line below it waits on the write.
 */
export default function UnsubscribePage(props: { searchParams: Promise<{ token?: string }> }) {
  return (
    <Suspense
      fallback={
        <main dir="rtl" className="mx-auto max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold">הוסרת מרשימת הדיוור</h1>
        </main>
      }
    >
      <UnsubscribePageBody {...props} />
    </Suspense>
  )
}

async function UnsubscribePageBody({
  searchParams,
}: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const result = await unsubscribeByToken(token ?? '')

  return (
    <main dir="rtl" className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-bold">הוסרת מרשימת הדיוור</h1>
      <p className="mt-3 text-gray-600">
        {result.ok ? 'לא יישלחו אליך יותר מיילים שיווקיים.' : result.error}
      </p>
      <a href="/" className="mt-6 inline-block underline">
        חזרה לחנות
      </a>
    </main>
  )
}
