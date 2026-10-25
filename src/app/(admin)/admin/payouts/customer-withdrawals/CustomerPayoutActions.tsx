'use client'

import { useState, useTransition } from 'react'
import { approveWithdrawal, completeWithdrawal, rejectWithdrawal } from './actions'

export default function CustomerPayoutActions({ requestId }: { requestId: string }) {
  const [isPending, startTransition] = useTransition()
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  const handleApprove = () => {
    if (!confirm('האם לאשר בקשת משיכה זו? לאחר האישור יהיה צורך לסמן כהושלם אחרי ביצוע התשלום.')) {
      return
    }

    startTransition(async () => {
      const result = await approveWithdrawal(requestId)
      if (result.success) {
        window.location.reload()
      } else {
        alert(result.error || 'שגיאה באישור הבקשה')
      }
    })
  }

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      alert('יש להזין סיבת דחייה')
      return
    }

    startTransition(async () => {
      const result = await rejectWithdrawal(requestId, rejectionReason)
      if (result.success) {
        setShowRejectDialog(false)
        window.location.reload()
      } else {
        alert(result.error || 'שגיאה בדחיית הבקשה')
      }
    })
  }

  const handleComplete = () => {
    startTransition(async () => {
      const result = await completeWithdrawal(requestId)
      if (result.success) {
        setShowCompleteDialog(false)
        window.location.reload()
      } else {
        alert(result.error || 'שגיאה בסימון כהושלם')
      }
    })
  }

  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={isPending}
          className="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-50"
        >
          אשר
        </button>
        <button
          type="button"
          onClick={() => setShowRejectDialog(true)}
          disabled={isPending}
          className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 disabled:opacity-50"
        >
          דחה
        </button>
        <button
          type="button"
          onClick={() => setShowCompleteDialog(true)}
          disabled={isPending}
          className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50"
        >
          סמן כהושלם
        </button>
      </div>

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">דחיית בקשת משיכה</h3>
            <div className="mb-4">
              <label htmlFor="rejection_reason" className="block text-sm font-medium mb-2">
                סיבת דחייה
              </label>
              <textarea
                id="rejection_reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full border rounded-md px-3 py-2 h-24"
                placeholder="הזן סיבת דחייה..."
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReject}
                disabled={isPending}
                className="flex-1 bg-red-600 text-white rounded-md px-4 py-2 font-medium hover:bg-red-700 disabled:opacity-50"
              >
                אשר דחייה
              </button>
              <button
                type="button"
                onClick={() => setShowRejectDialog(false)}
                disabled={isPending}
                className="px-4 py-2 border rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Dialog */}
      {showCompleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">סימון כהושלם</h3>
            <p className="text-sm text-gray-700 mb-4">
              האם ביצעת את התשלום ללקוח? פעולה זו תסמן את הבקשה כהושלמה.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleComplete}
                disabled={isPending}
                className="flex-1 bg-blue-600 text-white rounded-md px-4 py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                כן, הושלם
              </button>
              <button
                type="button"
                onClick={() => setShowCompleteDialog(false)}
                disabled={isPending}
                className="px-4 py-2 border rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
