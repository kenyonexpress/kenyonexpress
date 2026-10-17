'use client'

import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function AffiliateSignupPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [affiliateCode, setAffiliateCode] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      router.push('/auth/login')
    }
  }, [user, router])

  const handleSignup = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/affiliate/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commission_rate: 500 }), // 5% default
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to create affiliate account')
        return
      }

      setAffiliateCode(result.data.affiliate_code)
      setSuccess(true)
    } catch (err) {
      setError('An error occurred. Please try again.')
      console.error('Signup error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8 md:p-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">תוכנית שותפים - קנyon Express</h1>

          <p className="text-lg text-gray-600 mb-8">
            הצטרף לתוכנית השותפים שלנו וירוויח עמלות על כל הזמנה שתגיע דרך הקישור הייחודי שלך.
          </p>

          {!success ? (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-blue-900 mb-4">
                  היתרונות של תוכנית השותפים:
                </h2>
                <ul className="space-y-3 text-blue-800">
                  <li className="flex items-start">
                    <span className="ml-3 text-lg">✓</span>
                    <span>עמלה של 5% על כל הזמנה המגיעה דרך הקישור שלך</span>
                  </li>
                  <li className="flex items-start">
                    <span className="ml-3 text-lg">✓</span>
                    <span>חלון ייחוס של 30 ימים - כל ביקור שלך נספר</span>
                  </li>
                  <li className="flex items-start">
                    <span className="ml-3 text-lg">✓</span>
                    <span>לוח בקרה מלא עם סטטיסטיקות בזמן אמת</span>
                  </li>
                  <li className="flex items-start">
                    <span className="ml-3 text-lg">✓</span>
                    <span>הוצאה של עמלות בהעברה בנקאית</span>
                  </li>
                  <li className="flex items-start">
                    <span className="ml-3 text-lg">✓</span>
                    <span>תמיכה ישירה מהצוות שלנו</span>
                  </li>
                </ul>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800">{error}</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleSignup}
                disabled={loading}
                className="w-full bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-300 text-black font-bold py-3 px-6 rounded-lg transition-colors"
              >
                {loading ? 'טוען...' : 'הצטרף לתוכנית השותפים'}
              </button>

              <p className="text-center text-gray-600 text-sm">
                בהצטרפות אתה מסכים ל
                <Link href="/terms-and-conditions" className="underline">
                  {' '}
                  תנאי השימוש
                </Link>
              </p>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-8">
              <div className="text-center">
                <div className="text-5xl mb-4">✓</div>
                <h2 className="text-2xl font-bold text-green-900 mb-4">
                  ברוכים הבאים לתוכנית השותפים!
                </h2>

                <div className="bg-white border-2 border-green-300 rounded-lg p-6 mb-6">
                  <p className="text-gray-600 text-sm mb-2">קוד השותף שלך:</p>
                  <p className="text-3xl font-mono font-bold text-gray-900 mb-4">{affiliateCode}</p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(affiliateCode || '')
                    }}
                    className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded"
                  >
                    העתק קוד
                  </button>
                </div>

                <p className="text-gray-700 mb-6">
                  השתמש בקוד זה לשיתוף הקישורים שלך או גש ללוח הבקרה שלך כדי לראות סטטיסטיקות מלאות.
                </p>

                <div className="space-y-3">
                  <Link
                    href="/account/affiliate"
                    className="block bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                  >
                    גש ללוח הבקרה
                  </Link>
                  <Link
                    href="/"
                    className="block bg-gray-300 hover:bg-gray-400 text-black font-bold py-3 px-6 rounded-lg transition-colors"
                  >
                    חזור לעמוד הבית
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
