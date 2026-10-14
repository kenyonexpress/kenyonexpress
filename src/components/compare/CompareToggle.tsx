'use client'

import { useCompareList } from '@/components/compare/useCompareList'
import { COMPARE_MAX_ITEMS } from '@/lib/compare/storage'
import { Scale } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * "Add to comparison" on a listing card: a round overlay on the image, at
 * the corner the wishlist heart does not use.
 *
 * A button with a pressed state, never a link: picking a product is a state
 * change, and the way to the table is the bar above the grid
 * (`CompareBar`), which appears once something is picked.
 *
 * The refusal when the list is full clears itself, for the reason the heart
 * gives: a message that stays reads as the control's permanent state.
 */
export default function CompareToggle({
  productId,
  productName,
  className = '',
}: {
  productId: string
  /** Named in the label: a page of these otherwise reads as one control. */
  productName: string
  className?: string
}) {
  const { list, toggle } = useCompareList()
  const [full, setFull] = useState(false)
  const selected = list.includes(productId.toLowerCase())

  useEffect(() => {
    if (!full) return
    const id = setTimeout(() => setFull(false), 6000)
    return () => clearTimeout(id)
  }, [full])

  const label = selected ? 'הסר מההשוואה' : 'הוסף להשוואה'

  return (
    <>
      <button
        type="button"
        onClick={() => setFull(!toggle(productId))}
        aria-pressed={selected}
        aria-label={`${label}: ${productName}`}
        className={`absolute z-10 grid size-touch-min place-items-center rounded-full text-icon transition-opacity hover:opacity-70 ${className}`}
      >
        <Scale
          size={18}
          strokeWidth={1.8}
          aria-hidden="true"
          className={selected ? 'text-price' : ''}
        />
      </button>
      <output aria-live="polite" className={full ? 'text-nano text-price' : 'sr-only'}>
        {full ? `אפשר להשוות עד ${COMPARE_MAX_ITEMS} מוצרים. הסירו מוצר כדי להוסיף אחר.` : ''}
      </output>
    </>
  )
}
