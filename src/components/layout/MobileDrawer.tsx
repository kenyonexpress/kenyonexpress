'use client'

import { EcCloseRemove, EcMenu } from '@/components/icons/electro-icons'
import { KE_LIVE_CATEGORIES } from '@/lib/ke-live-hero-data'
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
 * NO SEARCH FIELD, deliberately. Live puts a search icon in the handheld
 * header and a full search form under it at 768. The standing project rule is
 * that there is no search UI anywhere, so neither is reproduced here; the
 * pixel cost of that decision is recorded in STATE.md rather than hidden.
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
        className="grid size-touch-min shrink-0 place-items-center text-icon transition-all duration-200 hover:opacity-70 active:scale-95 xl:hidden"
      >
        <EcMenu size={20} aria-hidden="true" className="transition-transform duration-300" />
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
        aria-hidden={!open}
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
        // RTL: the drawer slides in from the start (right in RTL), so it is
        // anchored START and translated +100% when closed. It was `end-0`,
        // which under dir="rtl" is the LEFT edge: computed `left: 0`, then
        // `translate: 100%` of its own width pushed it RIGHT, into the page.
        // Probed 2026-10-20 on the closed drawer: x350 w350 at 768 (fully
        // visible over the hero, the "vertical category list" in the 41.82%
        // run) and x280 w280 at 380 (100px of it on screen). Live's closed
        // panel sits at x769 at 768, i.e. just past the right edge, which is
        // what start-0 + translate-x-full gives.
        // KEPT MOUNTED BUT NOT IN THE TREE WHILE CLOSED. The panel stays in
        // the DOM so its transform can animate (see the note above), which
        // left a modal dialog, a close button and eight category links in the
        // accessibility tree of every page while nothing was open: a screen
        // reader could land in it and Tab reached its links off-screen.
        // `inert` removes it from focus and hit-testing, `aria-hidden` from
        // the tree, both for exactly as long as it is closed. The tests read
        // the closed state the same way assistive tech does.
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
        dir="rtl"
        className={`fixed inset-y-0 start-0 z-50 w-drawer-mobile overflow-y-auto bg-drawer outline-none transition-transform duration-300 motion-reduce:transition-none md:w-drawer-tablet xl:hidden ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-drawer-row items-center justify-between border-b border-border px-gutter animate-in fade-in slide-in-from-top duration-300 motion-reduce:animate-none">
          <h2 id={titleId} className="m-0 text-sm font-bold text-heading">
            {DRAWER_TITLE}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="סגירת התפריט"
            className="-me-2 grid size-touch-min place-items-center text-icon transition-all duration-200 hover:opacity-70 active:scale-95"
          >
            <EcCloseRemove
              size={20}
              aria-hidden="true"
              className="transition-transform duration-300 hover:rotate-90"
            />
          </button>
        </div>

        <nav aria-label={DRAWER_TITLE}>
          <ul className="m-0 list-none p-0">
            {KE_LIVE_CATEGORIES.map((category, index) => (
              <li
                key={category.slug}
                className="animate-in fade-in slide-in-from-right-4 duration-300 motion-reduce:animate-none"
                style={{
                  animationDelay: `${index * 30}ms`,
                  animationFillMode: 'both',
                }}
              >
                <Link
                  href={category.href ?? `/category/${category.slug}`}
                  // 50px is live's row height and clears the 44px touch floor
                  // on its own, so no padding trick is needed here.
                  onClick={close}
                  className={`flex h-drawer-row items-center border-b border-border px-gutter text-sm transition-all duration-200 hover:bg-surface-hover hover:ps-[calc(var(--gutter)+4px)] ${
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
