'use client'

import { maskPhone } from '@/lib/auth/phone-otp'
import { confirmPath } from '@/lib/auth/signup-phone'
import type { AuthState } from '@/server/actions/auth'
import { resendSignupPhoneOtp, verifySignupPhone } from '@/server/actions/signup-phone'
import Link from 'next/link'
import { useActionState } from 'react'

/**
 * Step two of the signup: the six digits that arrived by SMS.
 *
 * The number is carried in, masked, never re-typed: the verify action needs
 * the exact E.164 the code was sent to, and a second input would let the two
 * drift into "the code is wrong" for a customer whose code was fine.
 *
 * "Skip for now" is a real link, not a dark pattern in reverse: no
 * deployment sends SMS yet, and a customer whose text is late must be able
 * to finish creating the account. The number stays unverified on the
 * profile and can be proven later from the account page.
 */

function getError(state: AuthState): string | null {
  return state && 'error' in state ? state.error : null
}

export default function VerifyPhoneForm({ phone, next }: { phone: string; next?: string }) {
  const [verifyState, verifyAction, verifyPending] = useActionState<AuthState, FormData>(
    verifySignupPhone,
    null,
  )
  const [resendState, resendAction, resendPending] = useActionState<AuthState, FormData>(
    resendSignupPhoneOtp,
    null,
  )
  const resent = resendState && 'success' in resendState

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-semibold mb-2">אימות מספר הטלפון</h2>
      <p className="text-sm text-gray-500 mb-6">
        שלחנו קוד בן 6 ספרות ב-SMS למספר{' '}
        <span dir="ltr" className="font-medium text-gray-700">
          {maskPhone(phone)}
        </span>
        . הזינו אותו כאן כדי להמשיך.
      </p>

      <form action={verifyAction} className="space-y-4">
        <input type="hidden" name="phone" value={phone} />
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label htmlFor="signup-otp" className="block text-sm font-medium text-gray-700 mb-1">
            קוד האימות
          </label>
          <input
            id="signup-otp"
            name="token"
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            dir="ltr"
            placeholder="123456"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg tracking-[0.4em] placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        {getError(verifyState) && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {getError(verifyState)}
          </p>
        )}

        <button
          type="submit"
          disabled={verifyPending}
          className="w-full bg-brand text-heading hover:bg-brand-dark hover:text-white disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors"
        >
          {verifyPending ? 'מאמתים...' : 'אימות'}
        </button>
      </form>

      <form action={resendAction} className="mt-4">
        <input type="hidden" name="phone" value={phone} />
        {getError(resendState) && (
          <p className="mb-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {getError(resendState)}
          </p>
        )}
        {resent && (
          <p className="mb-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
            שלחנו קוד חדש
          </p>
        )}
        <button
          type="submit"
          disabled={resendPending}
          className="w-full border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60 font-medium rounded-lg py-2.5 text-sm transition-colors"
        >
          {resendPending ? 'שולחים...' : 'לא קיבלתי קוד, שלחו שוב'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-gray-500">
        <Link href={confirmPath(next, false)} className="text-link font-medium hover:underline">
          דלגו בינתיים
        </Link>
        {' · '}אפשר לאמת את המספר אחר כך מהאזור האישי
      </p>
    </div>
  )
}
