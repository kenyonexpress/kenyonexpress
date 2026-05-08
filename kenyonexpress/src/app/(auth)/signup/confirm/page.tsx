import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'אמתו את האימייל — KenyonExpress' }

export default function ConfirmPage() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
      <div className="text-5xl mb-4">📬</div>
      <h2 className="text-xl font-semibold mb-2">בדקו את תיבת הדואר</h2>
      <p className="text-sm text-gray-500 mb-6">
        שלחנו לכם קישור לאימות. לחצו עליו כדי להפעיל את החשבון.
      </p>
      <Link href="/login" className="text-brand text-sm font-medium hover:underline">
        חזרה לכניסה
      </Link>
    </div>
  )
}
