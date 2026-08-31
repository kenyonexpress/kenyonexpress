'use client'

import { type AuthState, updatePassword } from '@/server/actions/auth'
import Link from 'next/link'
import { useActionState } from 'react'

export default function ResetPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, null)

  const error = state && 'error' in state ? state.error : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-semibold mb-2">בחרו סיסמה חדשה</h2>
      <p className="text-sm text-gray-500 mb-6">הסיסמה חייבת להכיל לפחות 8 תווים וספרה אחת.</p>

      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            סיסמה חדשה
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="לפחות 8 תווים + ספרה"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        <div>
          <label
            htmlFor="confirm_password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            אימות סיסמה
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="הזינו שוב את הסיסמה"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        {error && (
          <div className="space-y-2">
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            {/*
              A way out, shown only once something has failed. This page is
              reached from a mail link and otherwise carries no navigation at
              all, so a customer whose link had expired was left on a dead end:
              the message now tells them to request a new one, and this is the
              only place on the screen that can.
            */}
            <Link
              href="/forgot-password"
              className="block text-center text-sm text-link hover:underline"
            >
              שליחת קישור איפוס חדש
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-brand text-heading hover:bg-brand-dark hover:text-white disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors"
        >
          {pending ? 'שומרים...' : 'עדכנו סיסמה'}
        </button>
      </form>
    </div>
  )
}
