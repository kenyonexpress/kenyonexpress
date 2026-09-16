'use client'

import { detectInstallSurface, readInstallEnvironment } from '@/lib/pwa/install-surface'
import { useEffect, useState } from 'react'

/**
 * The "add to home screen" invitation, in its two forms.
 *
 * CHROME AND ANDROID. Chrome fires `beforeinstallprompt` and lets the page
 * defer it; the native mini-infobar is suppressed the moment we call
 * preventDefault, so once we capture the event we are obliged to offer the
 * install ourselves or the user loses the option entirely. That is why the
 * banner renders off a captured event and never off a guess about the browser.
 *
 * iOS. Safari, and every other browser on iOS because they are all WebKit,
 * fires nothing and exposes no API. The only install path is the share
 * sheet's "Add to Home Screen", so on that platform the banner is
 * instructions and a single "got it" button. Which form is shown is decided
 * by `lib/pwa/install-surface.ts`, which is pure and tested on its own.
 *
 * Not shown on the money paths. A bar sliding up over the checkout during
 * payment costs an order, and the install is worth less than the order.
 *
 * A dismissal is remembered in localStorage, and it is ONE key for both forms.
 * Re-asking every visit is how a prompt gets ignored permanently, and there is
 * no second chance after that.
 */

const DISMISSED_KEY = 'ke:pwa-install-dismissed'
const HIDDEN_ON = ['/checkout', '/cart', '/account', '/supplier', '/admin', '/scan']

/**
 * NOT ON THE FIRST THING A VISITOR SEES.
 *
 * Chrome fires `beforeinstallprompt` as soon as the engagement heuristic is
 * satisfied, which can be within a second of the page painting, and the iOS
 * form has no event at all and could render on the first frame. Asking
 * somebody to install an app they have not looked at yet is how a prompt gets
 * dismissed permanently -- and the dismissal is remembered, so there is no
 * second chance.
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

/** What the banner has to offer: nothing yet, a captured prompt, or the iOS instructions. */
type Offer = { kind: 'none' } | { kind: 'prompt'; event: InstallPromptEvent } | { kind: 'ios' }

const BUTTON =
  'min-h-touch-min rounded-xl px-4 font-bold text-heading text-xs transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-brand-dark focus-visible:outline-offset-2'

export default function InstallPrompt() {
  const [offer, setOffer] = useState<Offer>({ kind: 'none' })
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
    if (localStorage.getItem(DISMISSED_KEY) === '1') return
    if (HIDDEN_ON.some((path) => window.location.pathname.startsWith(path))) return

    // `matchMedia` and `navigator.standalone` rather than a userAgent test for
    // the installed state: those are the only reliable signals that the app is
    // already on the home screen, in which case offering it is nonsense.
    const surface = detectInstallSurface(readInstallEnvironment(window))
    if (surface === 'installed') return

    if (surface === 'ios') {
      // No event will ever come. The instructions are the offer.
      setOffer({ kind: 'ios' })
      return
    }

    const onPrompt = (event: Event) => {
      // Suppresses Chrome's own infobar. From here the offer is ours to make.
      event.preventDefault()
      setOffer({ kind: 'prompt', event: event as InstallPromptEvent })
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const visible = offer.kind !== 'none' && engaged

  // Reserve the space for exactly as long as the banner occupies it.
  useEffect(() => {
    if (!visible) return
    document.documentElement.setAttribute(RESERVE_ATTRIBUTE, '')
    return () => document.documentElement.removeAttribute(RESERVE_ATTRIBUTE)
  }, [visible])

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setOffer({ kind: 'none' })
  }

  const install = async () => {
    if (offer.kind !== 'prompt') return
    const { event } = offer
    // The event is single-use: once prompted it cannot be prompted again, so
    // it is cleared regardless of the outcome.
    setOffer({ kind: 'none' })
    try {
      await event.prompt()
      await event.userChoice
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
      data-install-surface={offer.kind}
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
        {offer.kind === 'ios' ? (
          // The two taps, in the order Safari shows them. "שיתוף" is the
          // label under the share button in Hebrew iOS, and "הוסף למסך הבית"
          // is the sheet item verbatim, so the shopper is matching text they
          // can see rather than translating a description.
          <p className="text-gray-500 text-xs">
            לחצו על <span className="font-bold">שיתוף</span> בסרגל הדפדפן ואז על{' '}
            <span className="font-bold">הוסף למסך הבית</span>.
          </p>
        ) : (
          <p className="text-gray-500 text-xs">גישה מהירה מהמסך הראשי, גם בלי דפדפן.</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {offer.kind === 'ios' ? (
          <button type="button" onClick={dismiss} className={`${BUTTON} bg-brand-primary`}>
            הבנתי
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={dismiss}
              className="min-h-touch-min min-w-touch-min rounded-xl px-2 text-gray-500 text-xs transition-colors hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-brand-dark focus-visible:outline-offset-2"
            >
              לא עכשיו
            </button>
            <button type="button" onClick={install} className={`${BUTTON} bg-brand-primary`}>
              התקנה
            </button>
          </>
        )}
      </div>
    </section>
  )
}
