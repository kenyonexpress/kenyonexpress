'use client'

import { CheckCircle2, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { approveApplication, rejectApplication } from './actions'

interface Props {
  applicationId: string
}

export default function ApplicationReviewActions({ applicationId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  const handleApprove = async () => {
    if (!confirm('האם אתה בטוח שברצונך לאשר בקשה זו? הספק יקבל גישה למערכת.')) {
      return
    }

    setError('')
    setLoading(true)

    try {
      const result = await approveApplication(applicationId)

      if (result.success) {
        alert('הבקשה אושרה בהצלחה!')
        router.push('/admin/suppliers/applications')
        router.refresh()
      } else {
        setError(result.error || 'שגיאה באישור בקשה')
      }
    } catch {
      setError('שגיאה באישור בקשה')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('יש למלא סיבת דחייה')
      return
    }

    setError('')
    setLoading(true)

    try {
      const result = await rejectApplication(applicationId, rejectionReason)

      if (result.success) {
        alert('הבקשה נדחתה')
        router.push('/admin/suppliers/applications')
        router.refresh()
      } else {
        setError(result.error || 'שגיאה בדחיית בקשה')
      }
    } catch {
      setError('שגיאה בדחיית בקשה')
    } finally {
      setLoading(false)
      setShowRejectDialog(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-4">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleApprove}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle2 size={18} />
          אשר בקשה
        </button>

        <button
          type="button"
          onClick={() => setShowRejectDialog(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <XCircle size={18} />
          דחה בקשה
        </button>
      </div>

      {showRejectDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">דחיית בקשה</h3>

            <div>
              <label
                htmlFor="rejectionReason"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                סיבת הדחייה
              </label>
              <textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand"
                rows={4}
                placeholder="הסבר מדוע הבקשה נדחית..."
                required
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                aria-label="דחה"
                onClick={handleReject}
                disabled={loading || !rejectionReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'מבצע...' : 'דחה'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRejectDialog(false)
                  setRejectionReason('')
                }}
                disabled={loading}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
