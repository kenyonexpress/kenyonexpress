'use client'

import { t } from '@/lib/i18n/messages'
import { readPlatform, wantsIosInstallHint } from '@/lib/pwa/platform'
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
 *
 * TWO MOMENTS, ONE COMPONENT (W14, 05.10.2026, ARCHITECTURE-PWA §5.1).
 *
 *   `browse`         The root layout's copy. Fixed to the bottom, after a
 *                    real interaction, once per device. Hidden on every
 *                    money and account path.
 *   `first-purchase` The order confirmation's copy, rendered INLINE under
 *                    the first-purchase banner and only when the server said
 *                    this was the customer's first paid order. The purchase
 *                    IS the interaction, so there is no scroll gate; and the
 *                    path rule does not apply, because the order is already
 *                    paid and there is nothing left on the page to cover.
 *                    It ignores the browse moment's "shown once" flag but
 *                    honours an explicit "not now": a banner scrolled past
 *                    on a category page is not an answer, a pressed button
 *                    is.
 *
 * iOS HAS NO `beforeinstallprompt`, so on an iPhone or iPad in a browser tab
 * the same two moments show a hint instead of a button: share, then "Add to
 * Home Screen". The hint is gated exactly like the banner (interaction, once,
 * dismissal) and is never shown inside the installed app, which
 * `lib/pwa/platform` decides.
 */

const DISMISSED_KEY = 'ke:pwa-install-dismissed'

/**
 * ONCE, EVER, PER DEVICE -- and this is a different key from the dismissal on
 * purpose.
 *
 * The dismissal only records that somebody pressed "not now". A visitor who
 * scrolled past the banner without touching it pressed nothing, so on the old
 * behaviour the banner came back on the next visit, and the one after. That is
 * the definition of nagging, and it is worse than useless here: Chrome will not
 * fire `beforeinstallprompt` again once the app is installed, so the banner has
 * no upside to repeat for and every repeat spends goodwill on the same ask.
 *
 * Written the moment the banner BECOMES VISIBLE rather than when it is
 * answered, which is what makes "shown once" true rather than "answered once".
 */
const SHOWN_KEY = 'ke:pwa-install-shown'
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

export type InstallMoment = 'browse' | 'first-purchase'

export default function InstallPrompt({ moment = 'browse' }: { moment?: InstallMoment }) {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null)
  const [ios, setIos] = useState(false)
  const [engaged, setEngaged] = useState(moment === 'first-purchase')

  // The interaction gate. Registered once, torn down after the first signal.
  // The purchase moment is already past it.
  useEffect(() => {
    if (moment === 'first-purchase') return
    const onInteract = () => setEngaged(true)
    for (const type of INTERACTION_EVENTS) {
      window.addEventListener(type, onInteract, { once: true, passive: true })
    }
    return () => {
      for (const type of INTERACTION_EVENTS) window.removeEventListener(type, onInteract)
    }
  }, [moment])

  useEffect(() => {
    // `matchMedia` rather than a userAgent test: this is the only reliable way
    // to know the app is already installed and running standalone, in which
    // case offering to install it is nonsense.
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (localStorage.getItem(DISMISSED_KEY) === '1') return
    if (moment === 'browse') {
      if (localStorage.getItem(SHOWN_KEY) === '1') return
      if (HIDDEN_ON.some((path) => window.location.pathname.startsWith(path))) return
    }

    const platform = readPlatform()
    if (platform && wantsIosInstallHint(platform)) {
      // No event will ever come on iOS. The hint stands in for the button.
      setIos(true)
      return
    }

    const onPrompt = (event: Event) => {
      // Suppresses Chrome's own infobar. From here the offer is ours to make.
      event.preventDefault()
      setDeferred(event as InstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [moment])

  const visible = (deferred !== null || ios) && engaged
  const fixed = moment === 'browse'

  // Reserve the space for exactly as long as the banner occupies it, and spend
  // the one showing this device gets. Both are keyed off the same moment
  // because they are the same moment: the banner is on screen. The inline
  // purchase-page copy occupies its own flow and reserves nothing.
  useEffect(() => {
    if (!visible) return
    localStorage.setItem(SHOWN_KEY, '1')
    if (!fixed) return
    document.documentElement.setAttribute(RESERVE_ATTRIBUTE, '')
    return () => document.documentElement.removeAttribute(RESERVE_ATTRIBUTE)
  }, [visible, fixed])

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDeferred(null)
    setIos(false)
  }

  const install = async () => {
    if (!deferred) return
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

  const title = ios
    ? t('common.install_prompt.ios_title')
    : moment === 'first-purchase'
      ? t('common.install_prompt.first_purchase_title')
      : t('common.install_prompt.title')
  const body = ios
    ? t('common.install_prompt.ios_body')
    : moment === 'first-purchase'
      ? t('common.install_prompt.first_purchase_body')
      : t('common.install_prompt.body')

  const frame = fixed
    ? 'fixed inset-x-3 z-40 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg sm:inset-x-auto sm:end-4 sm:max-w-sm'
    : 'mx-auto mt-4 flex max-w-xl items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-start'

  return (
    // A section, not role="dialog". This is a passive suggestion the shopper
    // can ignore: it traps no focus and blocks nothing, and announcing it as a
    // dialog would promise assistive tech a modal that does not exist.
    <section
      dir="rtl"
      aria-label={t('common.install_prompt.label')}
      data-moment={moment}
      data-platform={ios ? 'ios' : 'prompt'}
      // `bottom` is the consent reservation plus the inset, not a fixed 12px.
      // Both banners are `fixed` at the bottom of the viewport, so with a
      // constant offset this one lands ON TOP of the consent banner whenever a
      // visitor has not answered it yet -- covering the two buttons they have
      // to press before anything else on the site works.
      style={fixed ? { insetBlockEnd: 'calc(0.75rem + var(--reserve-consent))' } : undefined}
      className={frame}
    >
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-heading text-sm">{title}</p>
        <p className="text-gray-500 text-xs leading-relaxed">{body}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {ios ? (
          <button
            type="button"
            onClick={dismiss}
            className="min-h-touch-min rounded-xl bg-brand-primary px-4 font-bold text-heading text-xs transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-brand-dark focus-visible:outline-offset-2"
          >
            {t('common.install_prompt.ios_got_it')}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={dismiss}
              className="min-h-touch-min min-w-touch-min rounded-xl px-2 text-gray-500 text-xs transition-colors hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-brand-dark focus-visible:outline-offset-2"
            >
              {t('common.install_prompt.dismiss')}
            </button>
            <button
              type="button"
              onClick={install}
              className="min-h-touch-min rounded-xl bg-brand-primary px-4 font-bold text-heading text-xs transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-brand-dark focus-visible:outline-offset-2"
            >
              {t('common.install_prompt.install')}
            </button>
          </>
        )}
      </div>
    </section>
  )
}
