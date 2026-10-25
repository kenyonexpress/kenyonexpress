import { verifySupplierEmail } from '@/lib/supplier-onboarding'
import { CheckCircle2, XCircle } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'אימות אימייל | Kenyon Express' }
export const instant = false

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token } = await searchParams

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="mb-6 inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full">
            <XCircle className="text-red-600" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">קישור לא תקין</h1>
          <p className="text-gray-600 mb-6">
            הקישור לאימות האימייל אינו תקין. אנא בדוק/י את הקישור שנשלח אליך במייל.
          </p>
          <Link
            href="/"
            className="inline-block bg-brand hover:bg-brand-primary-hover text-brand-dark px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            חזרה לדף הבית
          </Link>
        </div>
      </div>
    )
  }

  const result = await verifySupplierEmail(token)

  if (!result.success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="mb-6 inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full">
            <XCircle className="text-red-600" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">שגיאה באימות</h1>
          <p className="text-gray-600 mb-6">{result.error}</p>
          <Link
            href="/"
            className="inline-block bg-brand hover:bg-brand-primary-hover text-brand-dark px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            חזרה לדף הבית
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="mb-6 inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
          <CheckCircle2 className="text-green-600" size={32} />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-4">אימייל אומת בהצלחה!</h1>

        <div className="space-y-4 text-sm text-gray-600 mb-8">
          <p>כתובת האימייל שלך אומתה בהצלחה.</p>

          <p>הבקשה שלך נמצאת כעת בתהליך בדיקה על ידי הצוות שלנו.</p>

          <p>נעדכן אותך בתוצאות תוך 2-3 ימי עסקים.</p>
        </div>

        <Link
          href="/"
          className="inline-block bg-brand hover:bg-brand-primary-hover text-brand-dark px-6 py-3 rounded-lg font-semibold transition-colors"
        >
          חזרה לדף הבית
        </Link>
      </div>
    </div>
  )
}
