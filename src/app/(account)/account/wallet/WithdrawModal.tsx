'use client'

import { formatWalletAmount } from '@/lib/wallet/display'
import { useState, useTransition } from 'react'
import { requestWithdrawal } from './actions'

type PayoutMethod = 'bank_transfer' | 'cardcom_refund'

export default function WithdrawModal({
  balanceAgorot,
  savedPaymentMethods = [],
  onClose,
}: {
  balanceAgorot: number
  userId?: string
  savedPaymentMethods?: Array<{ id: string; last4: string; card_brand: string }>
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [amount, setAmount] = useState('')
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('bank_transfer')
  const [accountNumber, setAccountNumber] = useState('')
  const [branchCode, setBranchCode] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [selectedCardToken, setSelectedCardToken] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const amountNum = Number.parseFloat(amount)
    if (Number.isNaN(amountNum) || amountNum < 50) {
      setError('מינימום משיכה: 50 ₪')
      return
    }

    const amountAgorot = Math.round(amountNum * 100)
    if (amountAgorot > balanceAgorot) {
      setError('הסכום גבוה מהיתרה הזמינה')
      return
    }

    if (payoutMethod === 'bank_transfer') {
      if (!accountNumber || !branchCode || !referenceId) {
        setError('יש למלא את כל פרטי החשבון הבנקאי')
        return
      }
    }

    if (payoutMethod === 'cardcom_refund') {
      if (!selectedCardToken) {
        setError('יש לבחור כרטיס לקבלת ההחזר')
        return
      }
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('amount_agorot', String(amountAgorot))
      formData.set('payout_method', payoutMethod)
      if (payoutMethod === 'bank_transfer') {
        formData.set('account_number', accountNumber)
        formData.set('branch_code', branchCode)
        formData.set('reference_id', referenceId)
      } else if (payoutMethod === 'cardcom_refund') {
        formData.set('cardcom_token_id', selectedCardToken)
      }

      const result = await requestWithdrawal(formData)

      if (!result.success) {
        setError(result.error || 'שגיאה ביצירת בקשת משיכה')
      } else {
        setSuccess(true)
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      }
    })
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h2 className="text-xl font-bold mb-4 text-green-600">בקשה נשלחה בהצלחה!</h2>
          <p className="text-gray-700">בקשת המשיכה שלך התקבלה ותטופל בהקדם.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">משיכת יתרה מהארנק</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded">
          <p className="text-sm text-gray-600">יתרה זמינה:</p>
          <p className="text-lg font-bold">{formatWalletAmount(balanceAgorot)}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium mb-1">
              סכום למשיכה (₪)
            </label>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="50"
              max={balanceAgorot / 100}
              step="0.01"
              required
              className="w-full border rounded-md px-3 py-2"
              placeholder="מינימום 50 ₪"
            />
            <p className="text-xs text-gray-500 mt-1">מינימום משיכה: 50 ₪</p>
          </div>

          <div>
            <fieldset>
              <legend className="block text-sm font-medium mb-2">שיטת משיכה</legend>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="payout_method"
                    value="bank_transfer"
                    checked={payoutMethod === 'bank_transfer'}
                    onChange={() => setPayoutMethod('bank_transfer')}
                  />
                  <span>העברה בנקאית</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="payout_method"
                    value="cardcom_refund"
                    checked={payoutMethod === 'cardcom_refund'}
                    onChange={() => setPayoutMethod('cardcom_refund')}
                    disabled={savedPaymentMethods.length === 0}
                  />
                  <span className={savedPaymentMethods.length === 0 ? 'text-gray-400' : ''}>
                    החזר לכרטיס
                    {savedPaymentMethods.length === 0 && ' (אין כרטיסים שמורים)'}
                  </span>
                </label>
              </div>
            </fieldset>
          </div>

          {payoutMethod === 'bank_transfer' && (
            <div className="space-y-3 p-3 bg-gray-50 rounded">
              <div>
                <label htmlFor="reference_id" className="block text-sm font-medium mb-1">
                  אסמכתא (ת.ז. / ח.פ.)
                </label>
                <input
                  type="text"
                  id="reference_id"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  required
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="123456789"
                />
              </div>

              <div>
                <label htmlFor="account_number" className="block text-sm font-medium mb-1">
                  מספר חשבון
                </label>
                <input
                  type="text"
                  id="account_number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  required
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="123456"
                />
              </div>

              <div>
                <label htmlFor="branch_code" className="block text-sm font-medium mb-1">
                  קוד סניף
                </label>
                <input
                  type="text"
                  id="branch_code"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  required
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="123"
                />
              </div>
            </div>
          )}

          {payoutMethod === 'cardcom_refund' && savedPaymentMethods.length > 0 && (
            <div className="p-3 bg-gray-50 rounded">
              <label htmlFor="card_select" className="block text-sm font-medium mb-2">
                בחר כרטיס לקבלת החזר
              </label>
              <select
                id="card_select"
                value={selectedCardToken}
                onChange={(e) => setSelectedCardToken(e.target.value)}
                required
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="">-- בחר כרטיס --</option>
                {savedPaymentMethods.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.card_brand} ****{card.last4}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-brand-dark text-white rounded-md px-4 py-2 font-medium hover:bg-brand-darker disabled:opacity-50"
            >
              {isPending ? 'שולח...' : 'שלח בקשה'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 border rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              ביטול
            </button>
          </div>
        </form>

        <p className="text-xs text-gray-500 mt-4">
          הבקשה תיבדק ותאושר על ידי צוות האתר. התשלום יבוצע תוך 3-5 ימי עסקים.
        </p>
      </div>
    </div>
  )
}
