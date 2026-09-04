'use client'

import { useEffect, useState } from 'react'

/**
 * The "add to home screen" invitation.
 *
 * Chrome fires `beforeinstallprompt` and lets the page defer it; the native
 * mini-infobar is suppressed the moment we call preventDefault, so once we
 * capture the event we are obliged to offer the install ourselves or the user
 * loses the option entirely. That is why the banner renders off a captured
 * event and never off a guess about the browser.
 *
 * Not shown on the money paths. A bar sliding up over the checkout during
 * payment costs an order, and the install is worth less than the order.
 *
 * A dismissal is remembered in localStorage. Re-asking every visit is how a
 * prompt gets ignored permanently, and there is no second chance after that.
 */

const DISMISSED_KEY = 'ke:pwa-install-dismissed'
const HIDDEN_ON = ['/checkout', '/cart', '/account', '/supplier', '/admin', '/scan']

/**
 * NOT ON THE FIRST THING A VISITOR SEES.
 *
 * Chrome fires `beforeinstallprompt` as soon as the engagement heuristic is
 * satisfied, which can be within a second of the page painting. Asking somebody
 * to install an app they have not looked at yet is how a prompt gets dismissed
 * permanently -- and the dismissal is remembered, so there is no second chance.
 *
 * The gate is a real interaction on THIS visit: a scroll, a pointer down or a
 * key. Not a timer, because a timer fires at a shopper who walked away.
 */
const INTERACTION_EVENTS = ['scroll', 'pointerdown', 'keydown'] as const

/**
 * The attribute `globals.css` reserves space off. The banner is `fixed`, so
 * without this it lies on top of the bottom of the page -- which is what it was
 * doing, over the fold, on every page it appeared on.
 *
 * Set when the banner mounts and removed when it goes. The layout change lands
 * within 500ms of the interaction that allowed the banner, which is the window
 * browsers exclude from CLS, so reserving here costs nothing on the metric this
 * project holds at 0.
 */
const RESERVE_ATTRIBUTE = 'data-pwa-prompt'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null)
  const [engaged, setEngaged] = useState(false)

  // The interaction gate. Registered once, torn down after the first signal.
  useEffect(() => {
    const onInteract = () => setEngaged(true)
    for (const type of INTERACTION_EVENTS) {
      window.addEventListener(type, onInteract, { once: true, passive: true })
    }
    return () => {
      for (const type of INTERACTION_EVENTS) window.removeEventListener(type, onInteract)
    }
  }, [])

  useEffect(() => {
    // `matchMedia` rather than a userAgent test: this is the only reliable way
    // to know the app is already installed and running standalone, in which
    // case offering to install it is nonsense.
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (localStorage.getItem(DISMISSED_KEY) === '1') return
    if (HIDDEN_ON.some((path) => window.location.pathname.startsWith(path))) return

    const onPrompt = (event: Event) => {
      // Suppresses Chrome's own infobar. From here the offer is ours to make.
      event.preventDefault()
      setDeferred(event as InstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const visible = deferred !== null && engaged

  // Reserve the space for exactly as long as the banner occupies it.
  useEffect(() => {
    if (!visible) return
    document.documentElement.setAttribute(RESERVE_ATTRIBUTE, '')
    return () => document.documentElement.removeAttribute(RESERVE_ATTRIBUTE)
  }, [visible])

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDeferred(null)
  }

  const install = async () => {
    // The event is single-use: once prompted it cannot be prompted again, so
    // it is cleared regardless of the outcome.
    setDeferred(null)
    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch {
      // The browser refused to show it. Nothing to recover.
    }
  }

  return (
    // A section, not role="dialog". This is a passive suggestion the shopper
    // can ignore: it traps no focus and blocks nothing, and announcing it as a
    // dialog would promise assistive tech a modal that does not exist.
    <section
      dir="rtl"
      aria-label="התקנת האפליקציה"
      // `bottom` is the consent reservation plus the inset, not a fixed 12px.
      // Both banners are `fixed` at the bottom of the viewport, so with a
      // constant offset this one lands ON TOP of the consent banner whenever a
      // visitor has not answered it yet -- covering the two buttons they have
      // to press before anything else on the site works.
      style={{ insetBlockEnd: 'calc(0.75rem + var(--reserve-consent))' }}
      className="fixed inset-x-3 z-40 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg sm:inset-x-auto sm:end-4 sm:max-w-sm"
    >
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-heading text-sm">התקינו את KenyonExpress</p>
        <p className="text-gray-500 text-xs">גישה מהירה מהמסך הראשי, גם בלי דפדפן.</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={dismiss}
          className="min-h-touch-min min-w-touch-min rounded-xl px-2 text-gray-500 text-xs transition-colors hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-brand-dark focus-visible:outline-offset-2"
        >
          לא עכשיו
        </button>
        <button
          type="button"
          onClick={install}
          className="min-h-touch-min rounded-xl bg-brand-primary px-4 font-bold text-heading text-xs transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-brand-dark focus-visible:outline-offset-2"
        >
          התקנה
        </button>
      </div>
    </section>
  )
}
