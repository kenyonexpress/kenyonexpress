'use client'

import { beginPasskeyRegistration, finishPasskeyRegistration } from '@/server/actions/passkeys'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

/**
 * One-time, per-device nudge to add a passkey after a customer's first visit
 * to the account area. There is no "already asked" column in the database on
 * purpose (see STATE.md): dismissal is tracked client-side in localStorage,
 * keyed by user id. That scope is actually correct here, not a shortcut,
 * because a registered passkey is itself device/platform-bound.
 *
 * The registration choreography (begin action -> `startRegistration` ->
 * finish action) mirrors PasskeyManager exactly; this component only adds the
 * "should we even ask" gate and the seen-flag bookkeeping around it.
 */

function seenKey(userId: string): string {
  return `ke_passkey_prompt_seen:${userId}`
}

function markSeen(userId: string): void {
  try {
    window.localStorage.setItem(seenKey(userId), '1')
  } catch {
    // Storage disabled (private browsing, quota): worst case the prompt
    // reappears next visit, which is a nag, not a bug.
  }
}

function alreadySeen(userId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(userId)) !== null
  } catch {
    return false
  }
}

function registrationErrorHebrew(cause: unknown): string {
  if (cause instanceof Error && cause.name === 'InvalidStateError') {
    return 'המכשיר הזה כבר רשום בחשבון'
  }
  return 'הוספת המפתח נכשלה, נסו שוב'
}

export default function PasskeyRegisterPrompt({
  userId,
  hasPasskeys,
}: {
  userId: string
  hasPasskeys: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  // Support and "already asked" are both only knowable client-side, so the
  // prompt never renders on the server and appears (or not) after hydration.
  useEffect(() => {
    if (hasPasskeys) return
    if (alreadySeen(userId)) return
    if (!browserSupportsWebAuthn()) return
    setOpen(true)
  }, [userId, hasPasskeys])

  function dismiss(): void {
    markSeen(userId)
    setOpen(false)
  }

  function register(): void {
    startTransition(async () => {
      const begin = await beginPasskeyRegistration()
      if ('error' in begin) {
        // A real failure (not signed in, rate limited, unavailable): close
        // without marking seen so the next visit gets another chance.
        toast.error(begin.error)
        setOpen(false)
        return
      }
      let response: Awaited<ReturnType<typeof startRegistration>>
      try {
        response = await startRegistration({ optionsJSON: begin.options })
      } catch (cause) {
        if (cause instanceof Error && cause.name === 'NotAllowedError') {
          // The customer cancelled the OS prompt: an explicit "no", so treat
          // it exactly like "not now".
          dismiss()
          return
        }
        toast.error(registrationErrorHebrew(cause))
        setOpen(false)
        return
      }
      const finish = await finishPasskeyRegistration(response)
      if (finish && 'error' in finish) {
        toast.error(finish.error)
        setOpen(false)
        return
      }
      if (finish && 'success' in finish) {
        toast.success(finish.success)
      }
      markSeen(userId)
      setOpen(false)
    })
  }

  if (!open) return null

  return (
    <div className="passkey-prompt-overlay">
      {/* A div with role="dialog", not a native <dialog>: this component only
          ever mounts while `open` is true (see the early return above), so
          there is no showModal()/close() lifecycle to drive and a native
          element would add ref wiring for no benefit. Same call as
          MobileDrawer.tsx. */}
      <div
        className="passkey-prompt"
        // biome-ignore lint/a11y/useSemanticElements: see the note above.
        role="dialog"
        aria-modal="true"
        aria-labelledby="passkey-prompt-title"
        aria-describedby="passkey-prompt-desc"
      >
        <h2 id="passkey-prompt-title" className="passkey-prompt__title">
          כניסה מהירה בלי סיסמה
        </h2>
        <p id="passkey-prompt-desc" className="passkey-prompt__desc">
          אפשר לרשום מפתח כניסה (Passkey) למכשיר הזה, ובפעם הבאה להיכנס לחשבון עם טביעת אצבע או Face
          ID, בלי להקליד סיסמה.
        </p>
        <div className="passkey-prompt__actions">
          <button
            type="button"
            className="account-btn account-btn--primary"
            disabled={pending}
            onClick={register}
          >
            {pending ? 'רגע...' : 'הרשמה'}
          </button>
          <button type="button" className="account-btn" disabled={pending} onClick={dismiss}>
            לא עכשיו
          </button>
        </div>
      </div>
    </div>
  )
}
