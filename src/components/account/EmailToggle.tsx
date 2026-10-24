'use client'

import { useState, useTransition } from 'react'

type EmailToggleProps = {
  initial: boolean
  title: string
  description: string
  action: (
    granted: boolean,
  ) => Promise<{ ok: true; granted: boolean } | { ok: false; error: string }>
  ariaLabelId: string
}

export default function EmailToggle({
  initial,
  title,
  description,
  action,
  ariaLabelId,
}: EmailToggleProps) {
  const [on, setOn] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !on
    setError(null)
    startTransition(async () => {
      const outcome = await action(next)
      if (outcome.ok) setOn(outcome.granted)
      else setError(outcome.error)
    })
  }

  return (
    <div className="account-row">
      <div className="account-row__main">
        <p className="account-row__title" id={ariaLabelId}>
          {title}
        </p>
        <p className="account-row__meta">{description}</p>
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
          aria-labelledby={ariaLabelId}
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
