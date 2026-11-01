'use client'

import {
  type MfaEnrolState,
  type MfaVerifyState,
  startTotpEnrolment,
  verifyTotpCode,
} from '@/server/actions/mfa'
import { useActionState, useState, useTransition } from 'react'

/**
 * Two ceremonies, one form. 'challenge': a verified factor exists, ask for
 * the current code. 'enrol': create a factor server-side, show the QR and the
 * secret, then verify the first code, which is what flips the factor to
 * verified AND upgrades this session to aal2 in the same call.
 */
export default function AdminMfaForm({
  mode,
  factorId,
}: {
  mode: 'enrol' | 'challenge'
  factorId: string | null
}) {
  const [enrolment, setEnrolment] = useState<MfaEnrolState>(null)
  const [enrolPending, startEnrol] = useTransition()
  const [verifyState, verifyAction, verifyPending] = useActionState<MfaVerifyState, FormData>(
    verifyTotpCode,
    null,
  )

  const enrolError = enrolment && 'error' in enrolment ? enrolment.error : null
  const enrolled = enrolment && 'factorId' in enrolment ? enrolment : null
  const activeFactorId = factorId ?? enrolled?.factorId ?? null

  return (
    <div className="space-y-4">
      {mode === 'enrol' && !enrolled && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            סרקו קוד QR באפליקציית אימות (Google Authenticator, 1Password וכדומה) והזינו את הקוד
            שהיא מציגה.
          </p>
          {enrolError && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{enrolError}</div>
          )}
          <button
            type="button"
            disabled={enrolPending}
            onClick={() => startEnrol(async () => setEnrolment(await startTotpEnrolment()))}
            className="w-full flex items-center justify-center rounded-lg py-2.5 text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            {enrolPending ? 'יוצר מפתח...' : 'התחלת הגדרה'}
          </button>
        </div>
      )}

      {enrolled && (
        <div className="space-y-3">
          <div className="flex justify-center">
            {/* The QR arrives from GoTrue as an SVG document; an <img> with a
                data URL renders it without handing markup to the DOM. */}
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(enrolled.qrSvg)}`}
              alt="קוד QR להגדרת אימות דו-שלבי"
              width={176}
              height={176}
              className="border border-gray-200 rounded-lg p-2 bg-white"
            />
          </div>
          <p className="text-xs text-gray-500 text-center">
            אי אפשר לסרוק? הזינו את המפתח ידנית:{' '}
            <code dir="ltr" className="font-mono select-all break-all">
              {enrolled.secret}
            </code>
          </p>
        </div>
      )}

      {activeFactorId && (
        <form action={verifyAction} className="space-y-4">
          <input type="hidden" name="factor_id" value={activeFactorId} />
          <div>
            <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700 mb-1">
              קוד בן 6 ספרות
            </label>
            <input
              id="mfa-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-center text-lg tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          {verifyState?.error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {verifyState.error}
            </div>
          )}
          <button
            type="submit"
            disabled={verifyPending}
            className="w-full flex items-center justify-center rounded-lg py-2.5 text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            {verifyPending ? 'מאמת...' : 'אימות וכניסה'}
          </button>
        </form>
      )}
    </div>
  )
}
