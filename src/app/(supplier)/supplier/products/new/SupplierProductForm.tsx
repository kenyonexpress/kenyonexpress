'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { submitProduct } from './actions'

interface Props {
  supplierId: string
}

export default function SupplierProductForm({ supplierId }: Props) {
  const router = useRouter()
  const [formData, setFormData] = useState({
    nameHe: '',
    descriptionHe: '',
    priceIls: '',
    category: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.nameHe || !formData.priceIls) {
      setError('יש למלא שם ומחיר')
      return
    }

    const price = Number.parseFloat(formData.priceIls)
    if (Number.isNaN(price) || price <= 0) {
      setError('מחיר לא תקין')
      return
    }

    setLoading(true)

    try {
      const result = await submitProduct({
        supplierId,
        nameHe: formData.nameHe,
        descriptionHe: formData.descriptionHe || null,
        priceAgorot: Math.round(price * 100),
        category: formData.category || null,
      })

      if (result.success) {
        router.push('/supplier/products')
      } else {
        setError(result.error || 'שגיאה ביצירת מוצר')
      }
    } catch {
      setError('שגיאה ביצירת מוצר')
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

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>שימו לב:</strong> המוצר ישלח לבדיקה ואישור מנהל לפני שיופיע באתר. תקבלו הודעה כאשר
          המוצר יאושר או יידרש שינוי.
        </p>
      </div>

      <div>
        <label htmlFor="nameHe" className="block text-sm font-medium text-gray-700 mb-1">
          שם המוצר <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="nameHe"
          value={formData.nameHe}
          onChange={(e) => setFormData({ ...formData, nameHe: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand"
          required
          disabled={loading}
          maxLength={200}
        />
      </div>

      <div>
        <label htmlFor="descriptionHe" className="block text-sm font-medium text-gray-700 mb-1">
          תיאור המוצר
        </label>
        <textarea
          id="descriptionHe"
          value={formData.descriptionHe}
          onChange={(e) => setFormData({ ...formData, descriptionHe: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand"
          rows={4}
          disabled={loading}
          maxLength={1000}
        />
      </div>

      <div>
        <label htmlFor="priceIls" className="block text-sm font-medium text-gray-700 mb-1">
          מחיר (₪) <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          id="priceIls"
          value={formData.priceIls}
          onChange={(e) => setFormData({ ...formData, priceIls: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand"
          required
          disabled={loading}
          min="0"
          step="0.01"
          dir="ltr"
        />
      </div>

      <div>
        <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
          קטגוריה
        </label>
        <input
          type="text"
          id="category"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand"
          disabled={loading}
          maxLength={100}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          aria-label="שלח לאישור"
          disabled={loading}
          className="bg-brand hover:bg-brand-primary-hover text-brand-dark font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'שולח...' : 'שלח לאישור'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/supplier/products')}
          disabled={loading}
          className="bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          ביטול
        </button>
      </div>
    </form>
  )
}
