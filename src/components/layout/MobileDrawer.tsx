'use client'

import { KE_LIVE_CATEGORIES } from '@/lib/ke-live-hero-data'
import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * The off-canvas category drawer, and the hamburger that opens it.
 *
 * WHY THIS FILE EXISTS AT ALL. The live site ships an off-canvas navigation on
 * every viewport below xl and this project had none: the header simply dropped
 * its nav below `lg` and left a phone with no way to reach a category at all.
 * That is the biggest single structural difference behind the 380/768 compare
 * scores recorded in docs/KNOWN-ISSUES.md.
 *
 * GEOMETRY, measured off refs/ke_live_computed.json at 2026-09-03:
 *
 *   div.off-canvas-navigation.light   280px wide at 380, 350px at 768
 *   background                        --color-drawer-bg (measured, not white)
 *   li                                50px tall, 14px type, eleven of them
 *   button.navbar-toggle-hamburger    34x36 at x331 y136 (380)
 *
 * The eleven rows are exactly `KE_LIVE_CATEGORIES`, which is the same list the
 * desktop hero sidebar paints, so the drawer and the sidebar cannot drift.
 *
 * NO SEARCH FIELD IN THE DRAWER. Live puts a search icon in the handheld
 * header, not in the off-canvas panel, and since STEP 08 (30.09) so do we:
 * the icon is in the header's icon cluster (search/HandheldSearch.tsx) and
 * opens the site combobox in a row under the header. The drawer is categories
 * only, as live's is.
 *
 * CLOSING ON NAVIGATION IS DONE ON THE LINK, NOT FROM `usePathname()`.
 * Watching the pathname in an effect is the obvious way to write this and it
 * cost a build: `usePathname()` opts its whole subtree into dynamic rendering,
 * this drawer is mounted by the shared site header, and under `cacheComponents`
 * that turned every prerendered route into a dynamic one -- the build failed on
 * /account/orders/[id] with "Uncached data was accessed outside of <Suspense>",
 * a page that has nothing to do with the drawer. Closing in the link's onClick
 * needs no dynamic API and covers the same case, because the only way to
 * navigate from inside the panel is through one of these links.
 *
 * THE HAMBURGER IS 44px OF HIT AREA AROUND A 34x36 PAINT. Live's button is
 * 34x36, which is under the 44px touch floor the brief sets and which WCAG
 * 2.5.5 asks for. Padding the hit area rather than growing the icon keeps the
 * comparison honest -- the pixels match live, the thumb gets a real target.
 */

const DRAWER_TITLE = 'תפריט קטגוריות'

export default function MobileDrawer() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  const close = useCallback(() => setOpen(false), [])

  // Escape closes, and focus goes back to the button that opened it — without
  // the second half a keyboard user is dropped at the top of the document.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // The page behind a full-height overlay must not scroll. Restoring the
  // previous value rather than clearing it: another component may own it.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Move focus into the panel when it opens, so the next Tab is inside it.
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  // KEEP TAB INSIDE THE PANEL WHILE IT IS OPEN (STEP 32, 2026-10-07).
  //
  // The panel is `aria-modal="true"`, which tells a screen reader that
  // nothing outside it is reachable. The keyboard did not agree: focus moved
  // in on open, but the next Tab past the last category walked straight out
  // into the page behind the scrim, whose scroll is locked and which the
  // scrim visually covers. Measured on the built site at 390px: the 13th Tab
  // from the open drawer (close button, then twelve categories) landed on the
  // masthead logo link UNDER the scrim, and the next ones on the search,
  // wishlist and cart controls there. Axe reports nothing for this, because
  // it only reads the attribute.
  //
  // Same wrap as CartDrawer: first <-> last in both directions, and focus
  // that is already outside the panel (anything that stole it while the
  // drawer was open) is pulled back in instead of being allowed to wander.
  // The scrim button sits outside the panel on purpose: it is a pointer
  // affordance, and the keyboard has Escape and the X for the same job.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const focusables = () =>
      [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.getClientRects().length > 0)
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
    return () => document.removeEventListener('keydown', onTab)
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={DRAWER_TITLE}
        aria-expanded={open}
        aria-haspopup="dialog"
        // grid + place-items-center paints the 34x36 live box in the middle of
        // a 44px hit area rather than growing the icon.
        className="grid size-touch-min shrink-0 place-items-center text-icon transition-opacity hover:opacity-70 xl:hidden"
      >
        <Menu size={20} strokeWidth={2} aria-hidden="true" />
      </button>

      {/* The scrim, as a real <button> rather than a div with an onClick: the
          click-outside affordance is a control, so it gets a role, a label and
          keyboard behaviour for free instead of being bolted on. Kept mounted
          rather than unmounted so the panel's transform can animate, and
          `pointer-events-none` while closed so it never eats a tap. */}
      <button
        type="button"
        onClick={close}
        tabIndex={open ? 0 : -1}
        aria-label="סגירת התפריט"
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 motion-reduce:transition-none xl:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/*
        A div with role="dialog" and not a native <dialog>. `showModal()` would
        bring its own focus trap, but a native dialog is `display: none` until
        it opens, and display cannot be transitioned -- the 300ms slide-in this
        drawer shares with live would not run at all. The four effects above
        supply what showModal would have: Escape, focus in, focus back to the
        trigger, and a locked body.
      */}
      <div
        ref={panelRef}
        // biome-ignore lint/a11y/useSemanticElements: see the note above; <dialog> cannot animate in.
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // CLOSED MEANS GONE FROM THE TAB ORDER TOO (STEP 32). The panel is
        // kept mounted and translated off-screen so it can slide in, but a
        // translated element is still focusable: measured at 390 on the built
        // home page, Tab reached the drawer's close button while the drawer
        // was closed, at 44x44 entirely outside the viewport, with the twelve
        // category links behind it. `inert` takes the subtree out of focus,
        // hit testing and the accessibility tree while leaving `display`
        // alone, so the transition still runs.
        inert={!open}
        dir="rtl"
        // RTL: the drawer slides in from the right, so it is anchored right and
        // translated +100% when closed.
        className={`safe-pt safe-pb fixed inset-y-0 right-0 z-50 w-drawer-mobile overflow-y-auto bg-drawer outline-none transition-transform duration-300 motion-reduce:transition-none md:w-drawer-tablet xl:hidden ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-drawer-row items-center justify-between border-b border-border px-gutter">
          <h2 id={titleId} className="m-0 text-sm font-bold text-heading">
            {DRAWER_TITLE}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="סגירת התפריט"
            className="-me-2 grid size-touch-min place-items-center text-icon transition-opacity hover:opacity-70"
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <nav aria-label={DRAWER_TITLE}>
          <ul className="m-0 list-none p-0">
            {KE_LIVE_CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link
                  href={category.href ?? `/category/${category.slug}`}
                  // 50px is live's row height and clears the 44px touch floor
                  // on its own, so no padding trick is needed here.
                  onClick={close}
                  className={`flex h-drawer-row items-center border-b border-border px-gutter text-sm transition-colors hover:bg-surface-hover ${
                    category.highlight ? 'font-bold text-heading' : 'text-heading'
                  }`}
                >
                  {category.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  )
}
