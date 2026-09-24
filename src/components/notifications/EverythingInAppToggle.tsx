'use client'

import { t } from '@/lib/i18n/messages'
import { setEverythingInApp } from '@/server/actions/app-consent'
import { useState, useTransition } from 'react'

/**
 * The "everything in the app" switch, with the sentence the customer agrees to
 * printed right beside it. The sentence is what the recorded wording version
 * refers to, so it must not be edited without bumping
 * `APP_CONSENT_WORDING_VERSION`.
 *
 * Optimistic, and rolled back on a refused save: the switch never shows "on"
 * for a consent that was not recorded.
 */
export default function EverythingInAppToggle({
  initialOn,
  available,
}: {
  initialOn: boolean
  available: boolean
}) {
  const [on, setOn] = useState(initialOn)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function toggle() {
    const next = !on
    setOn(next)
    setError(null)
    start(async () => {
      const result = await setEverythingInApp(next, 'account_page')
      if (!result.ok) {
        setOn(!next)
        setError(result.error ?? t('appConsent.failed'))
      }
    })
  }

  return (
    <section className="account-card" aria-labelledby="app-consent-title">
      <h2 id="app-consent-title" className="account-card__title">
        {t('appConsent.title')}
      </h2>
      <p className="text-sm text-muted">{t('appConsent.body')}</p>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t('appConsent.title')}
          disabled={!available || pending}
          onClick={toggle}
          data-testid="app-consent-switch"
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${
            on ? 'bg-brand-primary' : 'bg-gray-300'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              on ? '-translate-x-6' : '-translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm font-semibold">
          {on ? t('appConsent.on') : t('appConsent.off')}
        </span>
      </div>
      {!available && (
        <p className="mt-2 text-sm text-muted" data-testid="app-consent-unavailable">
          {t('appConsent.unavailable')}
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
