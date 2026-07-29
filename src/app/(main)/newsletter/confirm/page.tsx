import { confirmNewsletter } from '@/server/actions/newsletter'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'אישור הרשמה', robots: { index: false, follow: false } }

export default async function ConfirmPage({
  searchParams,
}: { searchParams: Promise<{ token?: string }> }) {
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
