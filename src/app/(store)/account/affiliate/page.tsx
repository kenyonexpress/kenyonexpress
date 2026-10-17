'use client'

import { useAuth } from '@/hooks/useAuth'
import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import type { AffiliateStats } from '@/lib/types/affiliate'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function AffiliateDashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [stats, setStats] = useState<AffiliateStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payoutAmount, setPayoutAmount] = useState<string>('')
  const [requestingPayout, setRequestingPayout] = useState(false)
  const [payoutSuccess, setPayoutSuccess] = useState(false)

  useEffect(() => {
    if (!user) {
      router.push('/auth/login')
    }
  }, [user, router])

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/affiliate/stats')
        const result = await response.json()

        if (!response.ok) {
          // User might not have affiliate account yet
          setStats(null)
          return
        }

        setStats(result.data)
      } catch (err) {
        setError('Failed to load affiliate stats')
        console.error('Stats error:', err)
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      fetchStats()
    }
  }, [user])

  const handlePayoutRequest = async () => {
    const amount = Number.parseInt(payoutAmount, 10)

    if (!amount || amount <= 0) {
      setError('Invalid payout amount')
      return
    }

    setRequestingPayout(true)
    setError(null)

    try {
      const response = await fetch('/api/affiliate/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to request payout')
        return
      }

      setPayoutSuccess(true)
      setPayoutAmount('')
      // Refresh stats after successful payout
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (err) {
      setError('An error occurred. Please try again.')
      console.error('Payout error:', err)
    } finally {
      setRequestingPayout(false)
    }
  }

  if (!user) {
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">טוען...</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gray-50" dir="rtl">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              עדיין לא הצטרפת לתוכנית השותפים
            </h1>
            <p className="text-gray-600 mb-6">
              כדי לראות את הסטטיסטיקות שלך, תחילה עליך להצטרף לתוכנית.
            </p>
            <a
              href="/affiliate"
              className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-3 px-6 rounded-lg transition-colors inline-block"
            >
              הצטרף לתוכנית השותפים
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">לוח בקרה - תוכנית שותפים</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {payoutSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-800">בקשת התשלום שלך בוצעה בהצלחה!</p>
          </div>
        )}

        {/* Affiliate Code */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">קוד השותף שלך</h2>
          <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4">
            <p className="text-4xl font-mono font-bold text-gray-900">{stats.affiliate_code}</p>
            <p className="text-gray-600 mt-2">שתף קוד זה כדי להביא לקוחות חדשים</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm mb-2">סך הביקורים</p>
            <p className="text-3xl font-bold text-gray-900">
              {stats.total_clicks.toLocaleString('he-IL')}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm mb-2">הזמנות מיוחסות</p>
            <p className="text-3xl font-bold text-gray-900">
              {stats.total_attributed_orders.toLocaleString('he-IL')}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm mb-2">שיעור המרה</p>
            <p className="text-3xl font-bold text-gray-900">{stats.conversion_rate.toFixed(2)}%</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm mb-2">ממוצע הזמנה</p>
            <p className="text-3xl font-bold text-gray-900">
              {shekels(agorot(Math.floor(stats.average_order_value)))}
            </p>
          </div>
        </div>

        {/* Commission Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <p className="text-blue-600 text-sm mb-2">סך עמלות</p>
            <p className="text-3xl font-bold text-blue-900">
              {shekels(agorot(stats.total_commissions))}
            </p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <p className="text-green-600 text-sm mb-2">יתרה בתהליך</p>
            <p className="text-3xl font-bold text-green-900">
              {shekels(agorot(stats.pending_balance))}
            </p>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
            <p className="text-purple-600 text-sm mb-2">סך הוצא</p>
            <p className="text-3xl font-bold text-purple-900">
              {shekels(agorot(stats.total_paid_out))}
            </p>
          </div>
        </div>

        {/* Payout Request */}
        {stats.pending_balance > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">בקש הוצאה</h2>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="payout-amount"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  סכום להוצאה (₪)
                </label>
                <input
                  id="payout-amount"
                  type="number"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  min="0"
                  max={stats.pending_balance / 100}
                  step="1"
                  className="w-full md:w-1/3 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="הכנס סכום"
                />
                <p className="text-gray-600 text-sm mt-2">
                  יתרה זמינה: {shekels(agorot(stats.pending_balance))}
                </p>
              </div>
              <button
                type="button"
                onClick={handlePayoutRequest}
                disabled={requestingPayout || !payoutAmount}
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                {requestingPayout ? 'עיבוד...' : 'בקש הוצאה'}
              </button>
            </div>
          </div>
        )}

        {stats.pending_balance === 0 && (
          <div className="bg-gray-50 border border-gray-300 rounded-lg p-6 text-center">
            <p className="text-gray-600">אין לך יתרה זמינה להוצאה כרגע</p>
          </div>
        )}
      </div>
    </div>
  )
}
