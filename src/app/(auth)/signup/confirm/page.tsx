import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'אמתו את האימייל — KenyonExpress' }

/**
 * The email step. Since STEP 18 the phone step may have come first
 * (`/signup/verify-phone`); `?phone=verified` is that step reporting in, so
 * the customer sees both halves of the signup on one screen.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>
}) {
  const { phone } = await searchParams
  const phoneVerified = phone === 'verified'
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
      <div className="text-5xl mb-4">📬</div>
      <h2 className="text-xl font-semibold mb-2">בדקו את תיבת הדואר</h2>
      {phoneVerified && (
        <p className="mb-3 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
          מספר הטלפון אומת בהצלחה
        </p>
      )}
      <p className="text-sm text-gray-500 mb-6">
        שלחנו לכם קישור לאימות. לחצו עליו כדי להפעיל את החשבון.
      </p>
      <Link href="/login" className="text-link text-sm font-medium hover:underline">
        חזרה לכניסה
      </Link>
    </div>
  )
}
