'use client'

import { signOutAll } from '@/server/actions/auth'
import {
  type MfaEnrolState,
  type TotpFactor,
  finishTotpEnrolment,
  listTotpFactors,
  startTotpEnrolment,
  unenrolTotpFactor,
} from '@/server/actions/mfa'
import { useEffect, useState, useTransition } from 'react'

/**
 * TOTP enrollment and management, over Supabase Auth's native MFA (no table
 * of ours -- the provider that issues sessions owns the factors).
 *
 * EVERY CALL IS A SERVER ACTION. This component used to talk to GoTrue from
 * the browser client; since the session cookie went HttpOnly (STEP 18,
 * lib/auth/session-cookie.ts) that client has no session, so the four
 * ceremonies here (list, enrol, verify, unenrol) and the global sign-out run
 * in server/actions/mfa.ts and server/actions/auth.ts on the request-scoped
 * client, which reads the cookie the browser cannot.
 */
export default function SecurityClient({ isStaff }: { isStaff: boolean }) {
  const [factors, setFactors] = useState<TotpFactor[]>([])
  const [enrolment, setEnrolment] = useState<MfaEnrolState>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function refresh() {
    setFactors(await listTotpFactors())
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only load; refresh is recreated per render, so listing it would re-fetch MFA factors on every render
  useEffect(() => {
    void refresh()
  }, [])

  const enrolled = enrolment && 'factorId' in enrolment ? enrolment : null

  function beginEnroll() {
    setMessage(null)
    startTransition(async () => {
      const result = await startTotpEnrolment()
      if (!result || 'error' in result) {
        setMessage(result?.error ?? 'פתיחת ההרשמה נכשלה. נסה שוב.')
        return
      }
      setEnrolment(result)
    })
  }

  function verifyEnroll() {
    if (!enrolled) return
    setMessage(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.set('factor_id', enrolled.factorId)
      formData.set('code', code.trim())
      const result = await finishTotpEnrolment(null, formData)
      if (!result || 'error' in result) {
        setMessage(result?.error ?? 'קוד שגוי. נסה שוב.')
        return
      }
      setEnrolment(null)
      setCode('')
      setMessage('האימות הדו-שלבי הופעל.')
      await refresh()
    })
  }

  function unenroll(factorId: string) {
    setMessage(null)
    startTransition(async () => {
      const result = await unenrolTotpFactor(factorId)
      if (!result || 'error' in result) setMessage(result?.error ?? 'ההסרה נכשלה.')
      else setMessage('האמצעי הוסר.')
      await refresh()
    })
  }

  function signOutEverywhere() {
    setMessage(null)
    // Revokes every refresh token for the account, this device's included,
    // and the action itself redirects to /login.
    startTransition(async () => {
      await signOutAll()
    })
  }

  const verified = factors.filter((factor) => factor.status === 'verified')

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border-alt bg-white p-5">
        <h2 className="font-semibold">אימות דו-שלבי (TOTP)</h2>
        {isStaff ? (
          <p className="mt-1 text-sm text-muted">
            לחשבונות צוות: אחרי ההפעלה, כל כניסה לפאנל תדרוש קוד מאפליקציית אימות.
          </p>
        ) : null}
        {verified.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {verified.map((factor) => (
              <li key={factor.id} className="flex items-center justify-between text-sm">
                <span>אפליקציית אימות פעילה</span>
                <button
                  type="button"
                  onClick={() => unenroll(factor.id)}
                  disabled={isPending}
                  className="text-price underline disabled:opacity-50"
                >
                  הסרה
                </button>
              </li>
            ))}
          </ul>
        ) : enrolled ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm">
              סרוק את הקוד באפליקציית אימות (Google Authenticator, 1Password וכו') והזן את הקוד:
            </p>
            {/* The QR arrives from GoTrue as an SVG document; an <img> with a
                data URL renders it without handing markup to the DOM. */}
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(enrolled.qrSvg)}`}
              alt="קוד QR להרשמת אימות דו-שלבי"
              width={176}
              height={176}
            />
            <p className="text-xs text-muted">
              אי אפשר לסרוק? הזינו את המפתח ידנית:{' '}
              <code dir="ltr" className="font-mono select-all break-all">
                {enrolled.secret}
              </code>
            </p>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                dir="ltr"
                aria-label="קוד אימות"
                className="w-32 rounded-lg border border-border p-2 text-center tracking-widest"
              />
              <button
                type="button"
                onClick={verifyEnroll}
                disabled={isPending || code.trim().length < 6}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-ink disabled:opacity-50"
              >
                אישור
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={beginEnroll}
            disabled={isPending}
            className="mt-3 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            הפעלת אימות דו-שלבי
          </button>
        )}
      </section>

      <section className="rounded-xl border border-border-alt bg-white p-5">
        <h2 className="font-semibold">סשנים</h2>
        <p className="mt-1 text-sm text-muted">
          יציאה מכל המכשירים מנתקת כל סשן פתוח של החשבון, כולל זה.
        </p>
        <button
          type="button"
          onClick={signOutEverywhere}
          disabled={isPending}
          className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          יציאה מכל המכשירים
        </button>
      </section>

      {message ? (
        <output aria-live="polite" className="block text-sm text-heading">
          {message}
        </output>
      ) : null}
    </div>
  )
}
