'use client'

import { useEffect, useRef } from 'react'

/**
 * Keeps the frozen `TurnstileWidget` usable past its first submit.
 *
 * Two gaps in implicit rendering, both of which refuse a real person once a
 * key pair is configured, because the server reads a missing or spent token as
 * a failed challenge:
 *
 *   1. CLIENT NAVIGATION. Implicit rendering scans the page once, when api.js
 *      loads. `next/script` loads it once per session, so a widget mounted by a
 *      later client-side navigation (header link to /login) is never drawn and
 *      the form posts no token. On mount, an empty container is rendered
 *      explicitly with the same data-* values the widget wrote.
 *
 *   2. A REFUSED SUBMIT. A token is single-use. After a wrong password the
 *      action returns an error, the form stays, and the hidden field still
 *      holds the spent token, so the second try fails as `timeout-or-duplicate`.
 *      Whenever `resetOn` changes, the widget is reset for a fresh token.
 *
 * Place it inside the same `<form>` as the widget. Renders a hidden span and
 * does nothing when the widget rendered nothing (no site key).
 */

type TurnstileApi = {
  render: (container: HTMLElement, params: Record<string, string | undefined>) => string
  reset: (container?: HTMLElement | string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

function widgetIn(anchor: HTMLElement | null): HTMLElement | null {
  return anchor?.closest('form')?.querySelector<HTMLElement>('.cf-turnstile') ?? null
}

export default function TurnstileRefresh({ resetOn }: { resetOn?: unknown }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const first = useRef(true)

  useEffect(() => {
    const container = widgetIn(anchor.current)
    const api = window.turnstile
    // No api yet means api.js is still loading, and its implicit scan will
    // find this container. An existing child means it was already drawn.
    if (!container || !api || container.childElementCount > 0) return
    api.render(container, {
      sitekey: container.dataset.sitekey,
      action: container.dataset.action,
      language: container.dataset.language,
      theme: container.dataset.theme,
    })
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetOn is the trigger, not an input
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const container = widgetIn(anchor.current)
    if (container && container.childElementCount > 0) window.turnstile?.reset(container)
  }, [resetOn])

  return <span ref={anchor} hidden />
}
