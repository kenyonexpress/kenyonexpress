'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useTransition } from 'react'

type Factor = { id: string; status: string; friendly_name?: string | null }

/**
 * TOTP enrollment and management, straight against Supabase Auth's native MFA
 * (no table of ours -- the provider that issues sessions owns the factors).
 * Enrollment shows the provider's QR; verification flips the factor to
 * verified, and from then on the staff gates demand aal2 (lib/auth/mfa.ts).
 */
export default function SecurityClient({ isStaff }: { isStaff: boolean }) {
  const [factors, setFactors] = useState<Factor[]>([])
  const [qr, setQr] = useState<string | null>(null)
  const [enrollingId, setEnrollingId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function refresh() {
    const supabase = createClient()
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors((data?.totp ?? []) as Factor[])
  }
  useEffect(() => {
    void refresh()
  }, [])

  function beginEnroll() {
    setMessage(null)
    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error || !data) {
        setMessage('פתיחת ההרשמה נכשלה. נסה שוב.')
        return
      }
      setQr(data.totp?.qr_code ?? null)
      setEnrollingId(data.id)
    })
  }

  function verifyEnroll() {
    if (!enrollingId) return
    setMessage(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollingId,
        code: code.trim(),
      })
      if (error) {
        setMessage('קוד שגוי. נסה שוב.')
        return
      }
      setQr(null)
      setEnrollingId(null)
      setCode('')
      setMessage('האימות הדו-שלבי הופעל.')
      await refresh()
    })
  }

  function unenroll(factorId: string) {
    setMessage(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error)
        setMessage('ההסרה נכשלה — ייתכן שנדרש אימות דו-שלבי בסשן הנוכחי (התחבר מחדש עם קוד).')
      else setMessage('האמצעי הוסר.')
      await refresh()
    })
  }

  function signOutEverywhere() {
    setMessage(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut({ scope: 'global' })
      if (error) setMessage('היציאה נכשלה. נסה שוב.')
      else window.location.href = '/login'
    })
  }

  const verified = factors.filter((factor) => factor.status === 'verified')

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold">אימות דו-שלבי (TOTP)</h2>
        {isStaff ? (
          <p className="mt-1 text-sm text-gray-600">
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
        ) : qr ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm">
              סרוק את הקוד באפליקציית אימות (Google Authenticator, 1Password וכו') והזן את הקוד:
            </p>
            {/* The QR arrives as an SVG data URL from Supabase itself. */}
            <img src={qr} alt="קוד QR להרשמת אימות דו-שלבי" width={176} height={176} />
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                dir="ltr"
                aria-label="קוד אימות"
                className="w-32 rounded-lg border border-gray-300 p-2 text-center tracking-widest"
              />
              <button
                type="button"
                onClick={verifyEnroll}
                disabled={isPending || code.trim().length < 6}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-gray-900 disabled:opacity-50"
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
            className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            הפעלת אימות דו-שלבי
          </button>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold">סשנים</h2>
        <p className="mt-1 text-sm text-gray-600">
          יציאה מכל המכשירים מנתקת כל סשן פתוח של החשבון, כולל זה.
        </p>
        <button
          type="button"
          onClick={signOutEverywhere}
          disabled={isPending}
          className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          יציאה מכל המכשירים
        </button>
      </section>

      {message ? (
        <output aria-live="polite" className="block text-sm text-gray-800">
          {message}
        </output>
      ) : null}
    </div>
  )
}
