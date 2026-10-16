'use client'

import { useEffect, useState } from 'react'

export function SuccessPageShell({ children }: { children: React.ReactNode }) {
  const [isAnimated, setIsAnimated] = useState(false)

  useEffect(() => {
    // Trigger animation on mount
    setIsAnimated(true)
  }, [])

  return (
    <div className="success-page-shell">
      <div className="success-checkmark" data-animated={isAnimated}>
        <svg viewBox="0 0 100 100" className="success-checkmark__svg" aria-hidden="true">
          <circle
            cx="50"
            cy="50"
            r="45"
            className="success-checkmark__circle"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M 30 50 L 45 65 L 70 35"
            className="success-checkmark__path"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {children}
    </div>
  )
}
