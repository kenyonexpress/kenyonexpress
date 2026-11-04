'use client'

import { t } from '@/lib/i18n/messages'
import { readSnooze, writeSnooze } from '@/lib/pwa/snooze'
import { beginPasskeyRegistration, finishPasskeyRegistration } from '@/server/actions/passkeys'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { useEffect, useState, useTransition } from 'react'

/**
 * S19: register a passkey right after the first paid order, in place.
 *
 * The first-purchase banner already LINKED to /account/security, which is a
 * page change at the moment the customer is waiting for their coupon. This is
 * the one-tap version on the return page itself. The ceremony is the same
 * begin -> `startRegistration` -> finish that `PasskeyRegisterPrompt` and
 * `PasskeyManager` run, and it shares that prompt's snooze key, so a "not now"
 * here also quiets the account-area nudge for thirty days.
 */

type Status = 'hidden' | 'offer' | 'done' | 'error'

function passkeySnoozeKey(userId: string): string {
  return `ke_passkey_prompt_seen:${userId}`
}

export default function PasskeyAfterPurchase({
  userId,
  hasPasskeys,
}: {
  userId: string
  hasPasskeys: boolean
}) {
  const [status, setStatus] = useState<Status>('hidden')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (hasPasskeys) return
    if (readSnooze(passkeySnoozeKey(userId), Date.now())) return
    if (!browserSupportsWebAuthn()) return
    setStatus('offer')
  }, [userId, hasPasskeys])

  function dismiss(): void {
    writeSnooze(passkeySnoozeKey(userId), Date.now())
    setStatus('hidden')
  }

  function register(): void {
    startTransition(async () => {
      const begin = await beginPasskeyRegistration()
      if ('error' in begin) {
        setMessage(begin.error)
        setStatus('error')
        return
      }
      try {
        const response = await startRegistration({ optionsJSON: begin.options })
        const finish = await finishPasskeyRegistration(response)
        if (finish && 'error' in finish) {
          setMessage(finish.error)
          setStatus('error')
          return
        }
        writeSnooze(passkeySnoozeKey(userId), Date.now())
        setStatus('done')
      } catch (cause) {
        if (cause instanceof Error && cause.name === 'NotAllowedError') {
          dismiss()
          return
        }
        setMessage(
          cause instanceof Error && cause.name === 'InvalidStateError'
            ? t('passkeyAfterPurchase.alreadyRegistered')
            : t('passkeyAfterPurchase.failed'),
        )
        setStatus('error')
      }
    })
  }

  if (status === 'hidden') return null

  return (
    <section
      dir="rtl"
      aria-label={t('passkeyAfterPurchase.label')}
      data-testid="passkey-after-purchase"
      className="mx-auto mt-4 max-w-xl rounded-2xl border border-border bg-white p-4 text-start"
    >
      {status === 'done' ? (
        <output className="block font-bold text-heading text-sm">
          {t('passkeyAfterPurchase.done')}
        </output>
      ) : (
        <>
          <p className="font-bold text-heading text-sm">{t('passkeyAfterPurchase.title')}</p>
          <p className="mt-1 text-muted text-xs leading-relaxed">
            {t('passkeyAfterPurchase.body')}
          </p>
          {status === 'error' && message && (
            <p role="alert" className="mt-2 text-red-600 text-xs">
              {message}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={register}
              disabled={pending}
              className="min-h-touch-min rounded-xl bg-brand-primary px-4 py-2 font-bold text-heading text-xs transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? t('passkeyAfterPurchase.pending') : t('passkeyAfterPurchase.cta')}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="min-h-touch-min ms-auto px-2 py-2 text-muted text-xs hover:text-link"
            >
              {t('passkeyAfterPurchase.dismiss')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
