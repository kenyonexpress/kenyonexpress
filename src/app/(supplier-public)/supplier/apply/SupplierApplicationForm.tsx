'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { submitApplication } from './actions'

interface Props {
  agreementText: string
}

export default function SupplierApplicationForm({ agreementText }: Props) {
  const router = useRouter()
  const [formData, setFormData] = useState({
    businessName: '',
    phone: '',
    email: '',
    cardcomTerminalId: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvv: '',
    agreementAccepted: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAgreement, setShowAgreement] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.agreementAccepted) {
      setError('יש לאשר את תנאי השימוש')
      return
    }

    if (
      !formData.businessName ||
      !formData.phone ||
      !formData.email ||
      !formData.cardcomTerminalId
    ) {
      setError('יש למלא את כל השדות החובה')
      return
    }

    if (!formData.cardNumber || !formData.cardExpiry || !formData.cardCvv) {
      setError('יש למלא את פרטי הכרטיס לצורך אימות')
      return
    }

    setLoading(true)

    try {
      const result = await submitApplication(formData)

      if (result.success) {
        router.push('/supplier/apply/success')
      } else {
        setError(result.error || 'שגיאה בהגשת בקשה')
      }
    } catch (err) {
      console.error('Submit error:', err)
      setError('שגיאה בהגשת בקשה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">פרטי העסק</h2>

        <div>
          <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1">
            שם העסק <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="businessName"
            value={formData.businessName}
            onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand"
            required
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            טלפון <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="050-1234567"
            required
            disabled={loading}
            dir="ltr"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            אימייל <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="business@example.com"
            required
            disabled={loading}
            dir="ltr"
          />
        </div>

        <div>
          <label
            htmlFor="cardcomTerminalId"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            מספר טרמינל Cardcom <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="cardcomTerminalId"
            value={formData.cardcomTerminalId}
            onChange={(e) => setFormData({ ...formData, cardcomTerminalId: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="1234567"
            required
            disabled={loading}
            dir="ltr"
          />
          <p className="text-xs text-gray-500 mt-1">מספר הטרמינל שלך ב-Cardcom לקבלת תשלומים</p>
        </div>
      </div>

      <div className="space-y-4 border-t border-gray-200 pt-6">
        <h2 className="text-lg font-semibold text-gray-900">אימות כרטיס אשראי (חיוב ₪1 לאימות)</h2>
        <p className="text-sm text-gray-600">
          לצורך אימות נחייב את הכרטיס ב-₪1. הסכום יוחזר תוך 24 שעות.
        </p>

        <div>
          <label htmlFor="cardNumber" className="block text-sm font-medium text-gray-700 mb-1">
            מספר כרטיס <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="cardNumber"
            value={formData.cardNumber}
            onChange={(e) =>
              setFormData({ ...formData, cardNumber: e.target.value.replace(/\s/g, '') })
            }
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="4580 1234 5678 9012"
            required
            disabled={loading}
            dir="ltr"
            maxLength={19}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="cardExpiry" className="block text-sm font-medium text-gray-700 mb-1">
              תוקף <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="cardExpiry"
              value={formData.cardExpiry}
              onChange={(e) => setFormData({ ...formData, cardExpiry: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="MM/YY"
              required
              disabled={loading}
              dir="ltr"
              maxLength={5}
            />
          </div>

          <div>
            <label htmlFor="cardCvv" className="block text-sm font-medium text-gray-700 mb-1">
              CVV <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="cardCvv"
              value={formData.cardCvv}
              onChange={(e) => setFormData({ ...formData, cardCvv: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="123"
              required
              disabled={loading}
              dir="ltr"
              maxLength={4}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">תנאי שימוש לספקים</h3>
            <button
              type="button"
              onClick={() => setShowAgreement(!showAgreement)}
              className="text-xs text-brand hover:underline"
            >
              {showAgreement ? 'סגור' : 'הצג'}
            </button>
          </div>

          {showAgreement && (
            <div className="text-xs text-gray-700 whitespace-pre-wrap bg-white rounded border border-gray-200 p-3 max-h-48 overflow-y-auto">
              {agreementText}
            </div>
          )}
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.agreementAccepted}
            onChange={(e) => setFormData({ ...formData, agreementAccepted: e.target.checked })}
            className="mt-1 w-4 h-4 accent-brand"
            required
            disabled={loading}
          />
          <span className="text-sm text-gray-700">
            אני מאשר/ת את תנאי השימוש ומסכים/ה לתנאים המפורטים לעיל{' '}
            <span className="text-red-500">*</span>
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading || !formData.agreementAccepted}
        className="w-full bg-brand hover:bg-brand-primary-hover text-brand-dark font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'שולח...' : 'הגש בקשה'}
      </button>

      <p className="text-xs text-gray-500 text-center">
        לאחר הגשת הבקשה, נשלח אליך אימייל לאימות הכתובת. הבקשה תבדק על ידי הצוות שלנו ותקבל/י מענה
        תוך 2-3 ימי עסקים.
      </p>
    </form>
  )
}
