import { unsubscribeByToken } from '@/server/actions/newsletter'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'הסרה מרשימת הדיוור', robots: { index: false, follow: false } }

/**
 * One click, no login.
 *
 * The unsubscribe happens on load rather than behind a confirm button, because
 * RFC 8058 one-click requires the link in the header to work without further
 * interaction, and because every extra step here is a person pressing the spam
 * button instead.
 */
export default async function UnsubscribePage({
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
