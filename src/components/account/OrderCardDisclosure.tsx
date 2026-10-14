'use client'

import { toggleLabel } from '@/lib/account/order-card'
import { type ReactNode, useId, useState } from 'react'

/**
 * The expand control on an order card (UX19): a button with `aria-expanded`
 * and `aria-controls`, and the panel it opens. The panel's content is
 * rendered by the server (the lines, prices and chips come with the page)
 * and passed in as children; this component only owns the open/closed bit,
 * so there is no second fetch and nothing to spin on. Closed is `hidden`, not
 * unmounted: the names stay in the DOM for find-in-page and the toggle is
 * instant.
 */
export default function OrderCardDisclosure({
  lineCount,
  children,
}: {
  lineCount: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <>
      <button
        type="button"
        className="order-card__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{toggleLabel(open, lineCount)}</span>
        <svg
          className="order-card__chevron"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M3 6l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div id={panelId} className="order-card__details" hidden={!open}>
        {children}
      </div>
    </>
  )
}
