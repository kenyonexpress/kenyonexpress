'use client'

import { rehydrateCompareOnce, useCompareStore } from '@/lib/compare/client-store'
import { COMPARE_LIMIT } from '@/lib/compare/limit'
import { Scale, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * The compare tray: a small fixed pill that appears once a product is in the
 * list and takes the shopper to `/compare`. Painted only after hydration
 * (the list is empty on the server by design), so it is never in a
 * prerendered screenshot and the parity gate does not see it.
 *
 * WHERE IT SITS. Bottom start corner: the WhatsApp float owns the bottom END
 * corner (`end-5`, the left in RTL), and below `md` the phone's cart bar owns
 * the bottom edge (`mini-cart.css`, 4.25rem), so the pill lifts above that
 * bar there. Hidden on `/compare` itself, where it would only point at the
 * page the shopper is reading.
 */
export default function CompareBar() {
  const ids = useCompareStore((s) => s.ids)
  const hydrated = useCompareStore((s) => s.hydrated)
  const clear = useCompareStore((s) => s.clear)
  const pathname = usePathname()

  useEffect(() => {
    rehydrateCompareOnce()
  }, [])

  if (!hydrated || ids.length === 0 || pathname === '/compare') return null

  return (
    <section
      aria-label="השוואת מוצרים"
      dir="rtl"
      className="fixed start-4 bottom-[calc(4.25rem+0.75rem)] z-40 flex items-center gap-2 rounded-full border border-border-alt bg-white py-1.5 ps-3 pe-1.5 text-sm shadow-lg shadow-black/15 md:bottom-5"
    >
      <Scale size={18} strokeWidth={2} aria-hidden="true" className="text-price" />
      <Link href="/compare" className="font-bold text-heading hover:text-price">
        השוואה
        <span
          className="ms-1 font-normal text-muted"
          aria-label={`${ids.length} מתוך ${COMPARE_LIMIT}`}
        >
          ({ids.length}/{COMPARE_LIMIT})
        </span>
      </Link>
      <button
        type="button"
        onClick={clear}
        aria-label="נקה את ההשוואה"
        title="נקה את ההשוואה"
        className="tap-area tap-area--36 grid h-8 w-8 place-items-center rounded-full text-icon hover:bg-gray-100 hover:text-price"
      >
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </section>
  )
}
