'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * The aal2 challenge. Reached only from the staff gates (rbac.ts) when the
 * signed-in account has a verified TOTP factor this session has not proven.
 * Verification happens client-side against Supabase Auth directly; success
 * upgrades THIS session to aal2 and the gate lets the next request through.
 */
export default function MfaChallengeForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
      const factor = factors?.totp?.find((f) => f.status === 'verified') ?? factors?.totp?.[0]
      if (listError || !factor) {
        setError('לא נמצא אמצעי אימות. נסה להתחבר מחדש.')
        return
      }
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: code.trim(),
      })
      if (verifyError) {
        setError('קוד שגוי או שפג תוקפו. נסה שוב.')
        return
      }
      router.replace('/admin')
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-bold">אימות דו-שלבי</h1>
      <p className="text-sm text-gray-600">הזן את הקוד מאפליקציית האימות שלך כדי להמשיך לפאנל.</p>
      <input
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
      {error ? (
        <output aria-live="assertive" className="block text-sm text-price">
          {error}
        </output>
      ) : null}
      <button
        type="submit"
        disabled={isPending || code.trim().length < 6}
        className="w-full rounded-lg bg-primary py-3 font-bold text-gray-900 disabled:opacity-50"
      >
        {isPending ? 'מאמת…' : 'אימות'}
      </button>
    </form>
  )
}
