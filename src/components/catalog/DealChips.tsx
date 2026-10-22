'use client'

import { parseDealChips, toggleChipHref } from '@/lib/catalog/deal-chips'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * The weekend and free-shipping chips: one row that scrolls sideways on a
 * phone, both off by default, each a plain link so they work without
 * JavaScript and share like any URL. `basePath` lets the home page send the
 * chips into the catalogue, since the home grid is a fixed selection.
 */
export default function DealChips({ basePath }: { basePath?: string }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const chips = parseDealChips(params)
  const target = basePath ?? pathname
  const source = basePath ? new URLSearchParams() : new URLSearchParams(params)

  const items = [
    { key: 'weekend' as const, label: 'סוף שבוע', on: !basePath && chips.weekend },
    { key: 'free_shipping' as const, label: 'משלוח חינם', on: !basePath && chips.freeShipping },
  ]

  return (
    <nav aria-label="סינון מהיר" className="deal-chips">
      {items.map((item) => (
        <Link
          key={item.key}
          href={toggleChipHref(target, source, item.key)}
          // A link may not carry aria-pressed (axe aria-allowed-attr, Lighthouse
          // 2026-10-20). aria-current is the link-shaped way to say "this filter
          // is the one applied", and the --on class keeps the painted state.
          aria-current={item.on ? 'true' : undefined}
          className={`deal-chips__chip${item.on ? ' deal-chips__chip--on' : ''}`}
          scroll={false}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
