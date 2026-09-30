'use client'

import { type MfaVerifyState, listTotpFactors, verifyTotpCode } from '@/server/actions/mfa'
import { useActionState, useEffect, useState } from 'react'

/**
 * The aal2 challenge. Reached only from the staff gates (rbac.ts) when the
 * signed-in account has a verified TOTP factor this session has not proven.
 *
 * The factor is looked up and the code verified by Server Actions, not by
 * the browser client: the session cookie is HttpOnly (STEP 18), so only the
 * server holds the session to challenge against. Success upgrades THIS
 * session to aal2 and the action lands in the panel.
 */
export default function MfaChallengeForm() {
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined)
  const [state, action, pending] = useActionState<MfaVerifyState, FormData>(verifyTotpCode, null)
  const [code, setCode] = useState('')

  useEffect(() => {
    let cancelled = false
    void listTotpFactors().then((factors) => {
      if (cancelled) return
      const factor = factors.find((f) => f.status === 'verified') ?? factors[0]
      setFactorId(factor?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const error =
    factorId === null
      ? 'לא נמצא אמצעי אימות. נסה להתחבר מחדש.'
      : state && 'error' in state
        ? state.error
        : null

  return (
    <form action={action} className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-bold">אימות דו-שלבי</h1>
      <p className="text-sm text-gray-600">הזן את הקוד מאפליקציית האימות שלך כדי להמשיך לפאנל.</p>
      {factorId ? <input type="hidden" name="factor_id" value={factorId} /> : null}
      <input
        name="code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        dir="ltr"
        aria-label="קוד אימות"
        className="w-full rounded-lg border border-gray-300 p-3 text-center text-2xl tracking-[0.5em]"
      />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="remember_device" className="h-4 w-4" />
        זכור את המכשיר הזה ל-30 יום
      </label>
      {error ? (
        <output aria-live="assertive" className="block text-sm text-price">
          {error}
        </output>
      ) : null}
      <button
        type="submit"
        disabled={pending || !factorId || code.trim().length < 6}
        className="w-full rounded-lg bg-primary py-3 font-bold text-gray-900 disabled:opacity-50"
      >
        {pending ? 'מאמת…' : 'אימות'}
      </button>
    </form>
  )
}
