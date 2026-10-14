'use client'

import {
  type AuthDialogMode,
  LOGIN_DIALOG_EVENT,
  type LoginDialogDetail,
  currentLocationNext,
} from '@/lib/auth/login-dialog'
import { useEffect, useState } from 'react'

/** One press on a login link, as the dialog receives it. */
export interface LoginDialogRequest {
  /** Grows with every press, so a second press after a close reopens. */
  seq: number
  next: string
  /** The body the press asked for: the login card or the register stepper (UX24). */
  mode: AuthDialogMode
  /** The control that was focused at the press; focus goes back to it on close. */
  opener: HTMLElement | null
  /** The path the press happened on; a different path later means "navigated away, close". */
  pathname: string
}

/**
 * Listens for `ke:login-dialog` from the moment the shell hydrates, claims
 * every request, and hands the latest one to whoever renders the dialog.
 *
 * WHY THE LISTENER IS NOT INSIDE THE DIALOG. The dialog's module is loaded
 * after hydration (`DeferredLoginDialog`), and a press that lands between
 * the link hydrating and that chunk arriving found nobody listening, so the
 * link navigated to /login. MEASURED: on /products in the e2e run the press
 * straight after `load` opened the page, not the dialog, at every width,
 * while the same press on / after 800ms opened the dialog. The claim has to
 * be made by something that is already there, and this hook is small enough
 * to be.
 */
export function useLoginDialogRequest(): LoginDialogRequest | null {
  const [request, setRequest] = useState<LoginDialogRequest | null>(null)
  useEffect(() => {
    const onOpen = (event: Event) => {
      const custom = event as CustomEvent<LoginDialogDetail>
      // Claiming the event is what tells the link not to navigate.
      custom.preventDefault()
      const next = custom.detail?.next ?? currentLocationNext(window.location)
      const mode: AuthDialogMode = custom.detail?.mode === 'signup' ? 'signup' : 'login'
      const opener = document.activeElement as HTMLElement | null
      const pathname = window.location.pathname
      setRequest((prev) => ({ seq: (prev?.seq ?? 0) + 1, next, mode, opener, pathname }))
    }
    window.addEventListener(LOGIN_DIALOG_EVENT, onOpen)
    return () => window.removeEventListener(LOGIN_DIALOG_EVENT, onOpen)
  }, [])
  return request
}
