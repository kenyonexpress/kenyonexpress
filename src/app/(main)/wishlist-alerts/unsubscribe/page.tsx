import { applyWishlistUnsubscribe } from '@/server/wishlist/unsubscribe'
import Link from 'next/link'
import { Suspense } from 'react'

export const metadata = {
  title: 'הפסקת התראות על רשימת המשאלות',
  robots: { index: false, follow: false },
}

/**
 * One click, no login, same contract as /newsletter/unsubscribe: the write
 * happens on load because the reader arrived from an email client, and every
 * extra step here is a person pressing the spam button instead. The signed
 * token in the URL is the authorisation (`server/wishlist/unsubscribe.ts`).
 */

const HEADLINES: Record<string, string> = {
  alerts: 'לא יישלחו יותר התראות על ירידות מחיר וחזרה למלאי.',
  digest: 'הסיכום השבועי לרשימת המשאלות בוטל.',
  all: 'כל ההתראות על רשימת המשאלות בוטלו.',
}

export default function WishlistUnsubscribePage(props: {
  searchParams: Promise<{ token?: string }>
}) {
  return (
    <Suspense
      fallback={
        <main dir="rtl" className="mx-auto max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold">הפסקת התראות</h1>
        </main>
      }
    >
      <WishlistUnsubscribeBody {...props} />
    </Suspense>
  )
}

async function WishlistUnsubscribeBody({
  searchParams,
}: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const result = await applyWishlistUnsubscribe(token)

  return (
    <main dir="rtl" className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-bold">הפסקת התראות</h1>
      <p className="mt-3 text-gray-600">
        {result.ok
          ? HEADLINES[result.scope]
          : result.reason === 'invalid'
            ? 'הקישור אינו תקף או שפג תוקפו. אפשר לנהל את ההתראות מאזור החשבון.'
            : 'ההסרה נכשלה כרגע. אפשר לנסות שוב או לנהל את ההתראות מאזור החשבון.'}
      </p>
      <p className="mt-6 flex justify-center gap-4">
        <Link href="/account/notifications" className="underline">
          ניהול התראות
        </Link>
        <Link href="/" className="underline">
          חזרה לחנות
        </Link>
      </p>
    </main>
  )
}
