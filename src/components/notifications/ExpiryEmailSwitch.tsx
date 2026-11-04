'use client'

import { t } from '@/lib/i18n/messages'
import { type PreferenceRow, mayNotify } from '@/lib/notifications/preferences'
import { saveNotificationPreference } from '@/server/actions/notifications'
import { useState, useTransition } from 'react'

/**
 * The one email switch a customer has (S20): the coupon expiry reminder, 7
 * days and 1 day before. OFF until turned on, because the S12 policy forbids
 * the sweep from mailing on its own; the stored row this writes is the
 * customer asking. `mayNotify` reads the same row on the sending side, so the
 * box and the mail cannot disagree.
 *
 * A new file next to `PreferenceSwitches` rather than a column in its matrix:
 * that component is frozen, and its matrix has no email column by design.
 */
export default function ExpiryEmailSwitch({ rows }: { rows: PreferenceRow[] }) {
  const [on, setOn] = useState(() => mayNotify('voucher_expiring', 'email', rows))
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()

  return (
    <div className="mt-4 border-black/10 border-t pt-2">
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={on}
          className="h-5 w-5"
          onChange={(event) => {
            const next = event.target.checked
            setOn(next)
            setError(null)
            start(async () => {
              const result = await saveNotificationPreference('voucher_expiring', 'email', next)
              if (!result.ok) {
                setOn(!next)
                setError(result.error ?? t('expiryEmail.saveFailed'))
              }
            })
          }}
        />
        <span>{t('expiryEmail.label')}</span>
      </label>
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
