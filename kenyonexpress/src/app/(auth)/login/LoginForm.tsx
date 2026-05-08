'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { login, type AuthState } from '@/app/actions/auth'

export default function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, null)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-semibold mb-6">כניסה לחשבון</h2>

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
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              סיסמה
            </label>
            <Link href="/forgot-password" className="text-xs text-brand hover:underline">
              שכחתם סיסמה?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
        >
          {pending ? 'מתחברים...' : 'כניסה'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-gray-500">
        אין לכם חשבון?{' '}
        <Link href="/signup" className="text-brand font-medium hover:underline">
          הרשמה
        </Link>
      </p>
    </div>
  )
}
