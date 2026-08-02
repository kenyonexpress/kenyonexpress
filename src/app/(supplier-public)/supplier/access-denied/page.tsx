import Link from 'next/link'

export const metadata = { title: 'אין הרשאת ספק' }

export default function SupplierAccessDeniedPage() {
  return (
    <main
      dir="rtl"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12"
    >
      <h1 className="text-2xl font-bold text-heading">אין גישה לאזור הספקים</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        החשבון מחובר, אבל אינו רשום כחבר פעיל אצל ספק. אם אתם בית עסק חדש, הגישו בקשה דרך התמיכה או
        המתינו לאישור המנהל.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/login?next=/supplier"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heading px-4 text-sm font-bold text-white"
        >
          התחברות עם חשבון אחר
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700"
        >
          חזרה לחנות
        </Link>
      </div>
    </main>
  )
}
