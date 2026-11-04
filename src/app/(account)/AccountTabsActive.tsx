'use client'

import { useEffect } from 'react'

/**
 * V05: below 992 the account nav is one horizontally scrolling tab strip
 * (account-electro.css), and fifteen tabs do not fit 380px. Without this the
 * strip always opens at its start, so on /account/security the active tab is
 * eleven tabs off screen and nothing says where you are.
 *
 * NO usePathname HERE. A path hook in a layout-level client component either
 * stops the build (an id route with no static params) or, inside a Suspense,
 * writes a nonce-less $RC into every static account shell and fails
 * csp-shell-gate. AccountNav already marks the active tab with aria-current, so
 * this watches for that attribute instead: it fires when the nav streams in and
 * again on every client navigation, and reads nothing from the URL.
 *
 * It moves the STRIP only, through scrollBy on the list, never scrollIntoView:
 * that would also scroll the page. The delta comes from the two boxes rather
 * than scrollLeft, whose sign flips in RTL between engines. On the desktop
 * side column the list does not overflow and the delta is a no-op.
 */
export default function AccountTabsActive() {
  useEffect(() => {
    const shell = document.querySelector('.account-shell')
    if (!shell) return
    let last: Element | null = null
    let frame = 0

    const centre = () => {
      const active = shell.querySelector<HTMLElement>('.account-nav__link[aria-current="page"]')
      if (!active || active === last) return
      last = active
      const list = active.closest<HTMLElement>('.account-nav__list')
      if (!list || list.scrollWidth <= list.clientWidth) return
      const a = active.getBoundingClientRect()
      const l = list.getBoundingClientRect()
      list.scrollBy({ left: a.left + a.width / 2 - (l.left + l.width / 2) })
    }

    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(centre)
    })
    observer.observe(shell, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-current'],
    })
    centre()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
