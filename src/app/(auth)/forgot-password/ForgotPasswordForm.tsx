'use client'

import { type AuthState, sendPasswordReset } from '@/server/actions/auth'
import Link from 'next/link'
import { useActionState } from 'react'

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(sendPasswordReset, null)

  const error = state && 'error' in state ? state.error : null
  const success = state && 'success' in state ? state.success : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-semibold mb-2">שחזור סיסמה</h2>
      <p className="text-sm text-gray-500 mb-6">
        הזינו את כתובת האימייל שלכם ונשלח לכם קישור לאיפוס הסיסמה.
      </p>

      {success ? (
        <div className="space-y-4">
          <div className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">{success}</div>
          <Link href="/login" className="block text-center text-sm text-link hover:underline">
            חזרה לכניסה
          </Link>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              אימייל
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              dir="ltr"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-brand text-heading hover:bg-brand-dark hover:text-white disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors"
          >
            {pending ? 'שולחים...' : 'שלחו קישור לאיפוס'}
          </button>

          <p className="text-center text-sm text-gray-500">
            <Link href="/login" className="text-link hover:underline">
              חזרה לכניסה
            </Link>
          </p>
        </form>
      )}
    </div>
  )
}
