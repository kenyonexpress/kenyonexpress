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

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null)

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

  if (!deferred) return null

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
      className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg sm:inset-x-auto sm:end-4 sm:max-w-sm"
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
          className="min-h-11 rounded-xl px-2 text-gray-500 text-xs transition-colors hover:text-gray-900"
        >
          לא עכשיו
        </button>
        <button
          type="button"
          onClick={install}
          className="min-h-11 rounded-xl bg-brand-primary px-4 font-bold text-heading text-xs transition-opacity hover:opacity-90"
        >
          התקנה
        </button>
      </div>
    </section>
  )
}
