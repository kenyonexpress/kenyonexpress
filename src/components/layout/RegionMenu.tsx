'use client'

import { REGIONS, regionHref } from '@/lib/regions'
import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * The masthead's "בחר אזור" menu -- live's `secondary-nav`, which D3 skipped.
 *
 * WHAT LIVE ACTUALLY HAS, read off the rendered page at 1440 on 2026-09-03 and
 * not off the August snapshot: `.secondary-nav` holds exactly ONE menu item.
 * It is this region selector, and beneath it hang seventeen links to
 * `/city/<hebrew-slug>/`. The mega-menu-shaped thing in the theme's CSS
 * (`yamm`, `dropdown-submenu`, `yamm-fw`) is Electro boilerplate that this
 * site never fills in, so reproducing a multi-column mega panel would be
 * copying the theme rather than the site.
 *
 * MEASURED STYLE of live's dropdown, same reading:
 *
 *   background      white          -- --color-surface
 *   border-top      2px of the brand yellow -- --color-brand-primary exactly
 *   padding         8px 0          -- py-2
 *   width           200px          -- --spacing-region-menu
 *   font-size       14px           -- text-sm
 *   line-height     44.996px on the nav row -- --spacing-nav-row
 *
 * WHAT THIS REPLACES. The trigger was a plain `<Link href="/suppliers">` that
 * said "בחר אזור" and landed on the join-us-as-a-supplier marketing page --
 * a control whose label promised a region filter and whose target had no
 * regions on it at all. The label is now honest: it opens the regions.
 *
 * HOVER IS NOT THE ONLY WAY IN. Live opens this with `data-hover=dropdown`,
 * i.e. pointer only, which is unreachable by keyboard and by touch. Here hover
 * opens it on devices that hover, and click and Enter and Space and ArrowDown
 * all open it too. The paint matches; the control works for everyone.
 *
 * FOCUS AND ESCAPE follow MobileDrawer, deliberately, so the two menus in this
 * header behave the same way: Escape closes and returns focus to the trigger,
 * arrows walk the items, and a click outside closes. There is no focus TRAP,
 * because unlike the drawer this is a non-modal menu -- Tab should leave it.
 *
 * NO `usePathname()`. Same reason it is absent from MobileDrawer: it opts the
 * whole subtree into dynamic rendering, this component is mounted by the shared
 * header, and under `cacheComponents` that turns prerendered routes dynamic and
 * fails the build somewhere unrelated. Closing happens in the link's onClick.
 */

const LABEL = 'בחר אזור'

export default function RegionMenu() {
  // TWO SOURCES, ONE OPEN STATE, AND THE REASON IS A REAL BUG.
  //
  // This was a single `open` boolean that hover set and the trigger's click
  // TOGGLED. On anything with a pointer that is unopenable: moving onto the
  // trigger fires mouseenter and opens it, then the click that was meant to
  // open it toggles it shut. A tap does both in one gesture, so on a touch
  // device the menu could not be opened at all -- caught by driving the real
  // page rather than by reading the code.
  //
  // Hover and click are therefore separate inputs and `open` is their union:
  // hovering opens, clicking pins, and a pinned menu survives the pointer
  // leaving. Escape and an outside click clear both.
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const open = pinned || hovered
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const menuId = useId()

  const close = useCallback(() => {
    setPinned(false)
    setHovered(false)
  }, [])

  const closeAndRefocus = useCallback(() => {
    close()
    triggerRef.current?.focus()
  }, [close])

  // Escape closes and hands focus back. Without the second half a keyboard user
  // is dropped at the top of the document with the menu gone.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeAndRefocus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeAndRefocus])

  // A click anywhere else closes it. `pointerdown` and not `click`, so the menu
  // is gone before the outside control receives its own event.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, close])

  /** Move focus between items; wraps at both ends. */
  const focusItem = useCallback((index: number) => {
    const items = listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-region-item]')
    if (!items || items.length === 0) return
    const next = (index + items.length) % items.length
    items[next]?.focus()
  }, [])

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setPinned(true)
      // After paint, or the list is not in the DOM yet to receive focus.
      requestAnimationFrame(() => focusItem(0))
    }
  }

  const onListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const items = [
      ...(listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-region-item]') ?? []),
    ]
    const current = items.indexOf(document.activeElement as HTMLAnchorElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusItem(current + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusItem(current - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusItem(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusItem(items.length - 1)
    } else if (e.key === 'Tab') {
      close()
    }
  }

  return (
    <div
      ref={wrapRef}
      className="relative me-lg ms-region-inset hidden shrink-0 lg:block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setPinned((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        className="flex h-nav-row items-center gap-1 text-sm font-medium text-heading transition-opacity hover:opacity-70"
      >
        {LABEL}
        <ChevronDown
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={menuId}
          aria-label={LABEL}
          onKeyDown={onListKeyDown}
          dir="rtl"
          // 200px, 8px 0, white on a 2px brand top border: live's numbers, via
          // tokens. `end-0` and not `start-0` because the header is RTL and the
          // panel hangs from the trigger's leading edge, as live's does.
          className="absolute end-0 top-full z-50 w-region-menu border-t-2 border-brand bg-surface py-2 shadow-card"
        >
          {REGIONS.map((region) => (
            <li key={region.slug}>
              <Link
                href={regionHref(region)}
                data-region-item=""
                onClick={close}
                className="block px-4 py-1.5 text-sm text-heading transition-colors hover:bg-surface-hover"
              >
                {region.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
