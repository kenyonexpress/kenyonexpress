'use client'

import { setAllInAppNotifications } from '@/server/actions/notification-consent'
import { useState, useTransition } from 'react'

export default function AllInAppToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !on
    setError(null)
    startTransition(async () => {
      const outcome = await setAllInAppNotifications(next)
      if (outcome.ok) setOn(outcome.granted)
      else setError(outcome.error)
    })
  }

  return (
    <div className="account-row">
      <div className="account-row__main">
        <p className="account-row__title" id="all-in-app-label">
          קבל הכל באפליקציה
        </p>
        <p className="account-row__meta">
          עדכוני הזמנות, תזכורות לפני שתוקף קופון פג ומבצעים, כהתראה באפליקציה ובדפדפן.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="account-row__actions">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="all-in-app-label"
          onClick={toggle}
          disabled={pending}
          className={`account-btn ${on ? '' : 'opacity-70'}`}
        >
          {on ? 'פעיל' : 'כבוי'}
        </button>
      </div>
    </div>
  )
}
