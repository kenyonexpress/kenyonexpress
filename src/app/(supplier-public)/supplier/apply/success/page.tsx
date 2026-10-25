import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'בקשה נשלחה בהצלחה | Kenyon Express' }

export default function SupplierApplySuccessPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="mb-6 inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
          <CheckCircle2 className="text-green-600" size={32} />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-4">בקשתך נשלחה בהצלחה!</h1>

        <div className="space-y-4 text-sm text-gray-600 mb-8">
          <p>תודה על הגשת הבקשה להצטרפות כספק ב-Kenyon Express.</p>

          <p>בדקות הקרובות תקבל/י אימייל לאימות כתובת המייל שלך. אנא לחץ/י על הקישור באימייל.</p>

          <p>הבקשה שלך תבדק על ידי הצוות שלנו. נעדכן אותך בתוצאות הבדיקה תוך 2-3 ימי עסקים.</p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-start">
            <p className="font-semibold text-blue-900 mb-2">מה הלאה?</p>
            <ul className="space-y-1 text-blue-800">
              <li>✓ בדוק/י את תיבת האימייל שלך ואמת/י את הכתובת</li>
              <li>✓ הבקשה תועבר לבדיקת הצוות</li>
              <li>✓ במידה ותאושר, תקבל/י גישה לפורטל הספקים</li>
            </ul>
          </div>
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
