'use client'

import { X } from '@/components/icons'
import type { AuthDialogMode } from '@/lib/auth/login-dialog'
import { currentUserId } from '@/server/actions/session'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import LoginPanel from './LoginPanel'
import RegisterPanel from './RegisterPanel'
import type { LoginDialogRequest } from './useLoginDialogRequest'

const TITLES: Record<AuthDialogMode, string> = {
  login: 'כניסה לחשבון',
  signup: 'יצירת חשבון',
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * The storefront's login dialog (UX23): the /login page's body over the page
 * the shopper is on, instead of a trip away from it.
 *
 * MEASURED BEFORE (logs/ux23/before.json, the build of 444ed8051 at 380 / 768
 * / 1440): pressing the top bar's התחברות left the page for /login at every
 * width, with the cart, the product, the search the shopper was in the middle
 * of all one Back press away. The page is still there and still the thing
 * every link points at; this is the same `LoginPanel` rendered where the
 * shopper already is, with `next` set to that page so the sign-in lands them
 * back on it.
 *
 * ONE HOST, OPENED BY A REQUEST. `DeferredLoginDialog` mounts once in the
 * chrome (with the cart drawer), claims every `ke:login-dialog` a `LoginLink`
 * dispatches on a plain click, and renders this with the latest request; the
 * link cancels its navigation only when the event was claimed, so a route
 * group without the host, a middle-click and a reader without JavaScript all
 * keep the page. See lib/auth/login-dialog.ts and useLoginDialogRequest.ts.
 *
 * THE SAME MODAL MECHANICS AS THE CART DRAWER, for the same reasons written
 * there: `<dialog open>` rather than `showModal()` (jsdom has no `showModal`,
 * and the drawer's hand-rolled trap is the pattern every probe here already
 * measures), an overlay button, Escape, a body scroll lock as a class, a Tab
 * wrap in both directions that also pulls a focus that escaped back in, and
 * focus restored to the control that opened it (only while that control is
 * still on the page). Focus lands on the panel itself, which is labelled by
 * the title, so a screen reader hears "כניסה לחשבון, dialog" before the
 * first control; landing on the email field would pop a phone's keyboard
 * over the Google and passkey buttons the shopper has not read yet.
 *
 * IT CLOSES ITSELF ON NAVIGATION. Every sign-in action redirects, the layout
 * this is mounted in survives that navigation, and a dialog that survived
 * with it would sit over the page it just sent the shopper to.
 *
 * ALREADY SIGNED IN. The top bar's link is static (reading the session there
 * would make every prerendered route dynamic), so a signed-in shopper can
 * press it. The page shows them the form; the dialog asks the server once
 * and, if there is a session, shows the way to the account instead.
 *
 * TWO BODIES, ONE HOST (UX24). The request says which body it wants (a
 * press on a /login link or on a /signup one), and the two panels switch
 * between each other in place: "הרשמה" inside the login body opens the
 * register stepper, "כניסה" inside the stepper opens the login body, and
 * the title follows. The register flow ends in the dialog with a welcome
 * whose "המשך לגלוש" closes it; the account's mail is already on its way.
 */
export default function LoginDialog({
  request,
  phoneEnabled = false,
}: {
  request: LoginDialogRequest
  phoneEnabled?: boolean
}) {
  // The request this is open for; null once closed. A new `seq` reopens.
  const [active, setActive] = useState<LoginDialogRequest | null>(request)
  const [mode, setMode] = useState<AuthDialogMode>(request.mode)
  const [signedIn, setSignedIn] = useState(false)
  const pathname = usePathname()
  const panelRef = useRef<HTMLDialogElement>(null)

  const close = useCallback(() => setActive(null), [])

  useEffect(() => {
    setSignedIn(false)
    setMode(request.mode)
    setActive(request)
  }, [request])

  const open = active !== null
  const next = active?.next ?? null

  // A body switch unmounts the link that was pressed, and focus would fall
  // to <body> behind the overlay (measured in logs/ux24/after.json: focus on
  // BODY after הרשמה). Put it back on the labelled panel, where the opening
  // put it, so the new title is read before the first control.
  const focusedMode = useRef(mode)
  useEffect(() => {
    if (focusedMode.current === mode) return
    focusedMode.current = mode
    panelRef.current?.focus()
  }, [mode])

  // A navigation while open (a sign-in's redirect, a link in the panel) closes it.
  useEffect(() => {
    if (active && pathname !== active.pathname) close()
  }, [active, pathname, close])

  // The session question, asked once per opening.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void currentUserId()
      .then((id) => {
        if (!cancelled && id) setSignedIn(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  // Escape, and the body scroll lock as a class (see CartDrawer for why).
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('login-dialog-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('login-dialog-open')
    }
  }, [open, close])

  // Focus in, the Tab wrap, focus back out.
  useEffect(() => {
    const panel = panelRef.current
    if (!open || !panel) return
    const focusables = () =>
      [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0,
      )
    const opener = active?.opener ?? null
    panel.focus()
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0] as HTMLElement
      const last = items[items.length - 1] as HTMLElement
      const active = document.activeElement
      if (!panel.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onTab)
    return () => {
      document.removeEventListener('keydown', onTab)
      if (opener?.isConnected) opener.focus()
    }
  }, [open, active])

  if (!open || next === null) return null

  return (
    <div className="login-dialog-root" role="presentation" data-testid="login-dialog-root">
      <button
        type="button"
        className="login-dialog__overlay"
        aria-label="סגירת חלון הכניסה"
        onClick={close}
      />
      <dialog
        ref={panelRef}
        open
        className="login-dialog"
        aria-labelledby="login-dialog-title"
        aria-modal="true"
        tabIndex={-1}
        data-mode={mode}
      >
        <header className="login-dialog__header">
          <h2 id="login-dialog-title" className="login-dialog__title">
            {TITLES[mode]}
          </h2>
          <button type="button" className="login-dialog__close" aria-label="סגירה" onClick={close}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="login-dialog__body">
          {signedIn ? (
            <div className="login-dialog__signed-in" data-testid="login-dialog-signed-in">
              <p className="login-dialog__signed-in-text">אתם כבר מחוברים לחשבון.</p>
              <Link href="/account" className="login-dialog__account-link">
                לאזור האישי
              </Link>
            </div>
          ) : mode === 'signup' ? (
            <RegisterPanel
              next={next}
              variant="dialog"
              onLogin={() => setMode('login')}
              onDone={close}
            />
          ) : (
            <LoginPanel
              next={next}
              phoneEnabled={phoneEnabled}
              variant="dialog"
              onSignup={() => setMode('signup')}
            />
          )}
        </div>
      </dialog>
    </div>
  )
}
