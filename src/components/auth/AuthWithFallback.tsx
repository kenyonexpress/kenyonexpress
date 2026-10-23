/**
 * Authentication component with intelligent fallback
 *
 * Attempts passkey/WhatsApp auth first, then falls back to email OTP
 * after N consecutive failures. Demonstrates the full auth flow integration.
 */

'use client'

import { checkAuthFallback } from '@/server/actions/auth'
import { useEffect, useState } from 'react'

interface AuthMethod {
  id: 'passkey' | 'whatsapp' | 'email'
  label: string
  enabled: boolean
}

export function AuthWithFallback({
  userEmail,
  userPhone,
}: {
  userEmail?: string
  userPhone?: string
}) {
  const [shouldShowEmailFallback, setShouldShowEmailFallback] = useState(false)
  const [availableMethods, setAvailableMethods] = useState<AuthMethod[]>([
    { id: 'passkey', label: 'כניסה עם Passkey', enabled: true },
    { id: 'whatsapp', label: 'כניסה עם WhatsApp', enabled: true },
    { id: 'email', label: 'כניסה עם אימייל', enabled: false },
  ])

  // Check if email fallback should be offered on mount
  useEffect(() => {
    async function checkFallback() {
      if (userEmail || userPhone) {
        const result = await checkAuthFallback({
          email: userEmail,
          phone: userPhone,
        })

        if (result.shouldFallback) {
          setShouldShowEmailFallback(true)
          setAvailableMethods((prev) =>
            prev.map((m) => (m.id === 'email' ? { ...m, enabled: true } : m)),
          )
        }
      }
    }

    checkFallback()
  }, [userEmail, userPhone])

  return (
    <div className="space-y-4" dir="rtl">
      <div className="text-sm text-gray-600">
        {shouldShowEmailFallback && (
          <p className="mb-2 text-orange-600">
            זוהו מספר ניסיונות כניסה כושלים. אנחנו מציעים לך גם כניסה עם אימייל.
          </p>
        )}
      </div>

      <div className="space-y-2">
        {availableMethods
          .filter((m) => m.enabled)
          .map((method) => (
            <button
              key={method.id}
              type="button"
              className="w-full px-4 py-3 text-sm font-medium border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {method.label}
            </button>
          ))}
      </div>

      {shouldShowEmailFallback && (
        <p className="text-xs text-gray-500 text-center">
          שיטת הכניסה עם אימייל הוצעה אוטומטית לאחר ניסיונות כושלים
        </p>
      )}
    </div>
  )
}
