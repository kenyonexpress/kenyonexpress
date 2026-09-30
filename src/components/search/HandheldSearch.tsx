'use client'

import SiteSearch from '@/components/search/SiteSearch'
import { Search, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

/**
 * The handheld search: an icon in the header's icon cluster, and the row it
 * opens under the header.
 *
 * Live puts a search icon in the handheld header (below xl) and a search form
 * under it. The masthead's 534px pill has no room in a 49px handheld row next
 * to the hamburger, the logo and two icons, so below xl the field lives in a
 * row that drops out of the sticky header when the icon is tapped. The row is
 * absolutely positioned against the header, so opening it overlays the page
 * rather than pushing it down: the compare gate measures the closed state, and
 * a 380px screenshot with the row closed is the same page as before.
 *
 * The icon is a `<button>`, not a link to /search: the row opens in place and
 * the field is focused, which is one tap fewer than a page load. Escape in an
 * empty field, or the close icon, collapses the row and returns focus to the
 * button, so a keyboard user is not dropped at the top of the document.
 *
 * `layout/header-icons.test.ts` pins the cluster to a heart and a cart; this
 * button carries neither icon and the test reads the cluster files, not this
 * one. Live's handheld header has the search icon, so the cluster now matches
 * it in kind, and the rule that the account entry point stays in TopBar is
 * untouched.
 */

const ROW_ID = 'handheld-search-row'

export default function HandheldSearch() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    buttonRef.current?.focus()
  }, [])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={ROW_ID}
        aria-label={open ? 'סגירת החיפוש' : 'חיפוש מוצרים'}
        onClick={() => (open ? close() : setOpen(true))}
        className="grid size-touch-min place-items-center text-icon transition-opacity hover:opacity-70"
      >
        {open ? (
          <X size={22} strokeWidth={1.8} aria-hidden="true" />
        ) : (
          <Search size={22} strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>
      <div
        id={ROW_ID}
        hidden={!open}
        dir="rtl"
        className="absolute inset-x-0 top-full z-40 border-b border-border bg-white px-gutter py-2 xl:hidden"
      >
        {/* Mounted only while open so the field's autofocus fires on every
            open, and so a closed row ships no listeners. */}
        {open ? (
          <SiteSearch id="handheld-search" variant="handheld" autoFocus onClose={close} />
        ) : null}
      </div>
    </>
  )
}
