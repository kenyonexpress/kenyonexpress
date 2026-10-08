'use client'

import { rehydrateCompareOnce, useCompareStore, useIsCompared } from '@/lib/compare/client-store'
import { isCompareId } from '@/lib/compare/ids'
import { COMPARE_LIMIT } from '@/lib/compare/limit'
import { Scale } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { toast } from 'sonner'

/**
 * "השוו" on a product, everywhere a product appears, next to the heart.
 *
 * Client-only state, like the heart: the grids and the product page are
 * cached for every visitor, so whether THIS shopper is comparing the product
 * is read after paint from the one browser-side list
 * (`lib/compare/client-store.ts`) and never rendered on the server.
 *
 * TWO VARIANTS, ONE BEHAVIOUR.
 *   `overlay`  the small round control in a card's image corner, under the
 *              heart. Hidden until the card is hovered on a device that can
 *              hover (the pixel gate's un-hovered screenshots stay unchanged),
 *              always shown where there is no hover, and always shown once
 *              the product is in the list.
 *   `inline`   icon plus a word, sized to sit in the product page's share
 *              row without changing its measured height.
 *
 * FULL IS A SENTENCE, NOT A SWAP. The fifth product is refused with a toast
 * that says the limit and offers the compare page, where the shopper
 * decides which column goes.
 */
export default function CompareButton({
  productId,
  variant = 'inline',
  className,
}: {
  productId: string
  variant?: 'inline' | 'overlay'
  className?: string
}) {
  const active = useIsCompared(productId)
  const toggle = useCompareStore((s) => s.toggle)
  const router = useRouter()

  useEffect(() => {
    rehydrateCompareOnce()
  }, [])

  function onToggle(event: React.MouseEvent) {
    // On a card the control sits over a link to the product; the click is ours.
    event.preventDefault()
    event.stopPropagation()
    const result = toggle(productId)
    if (result.ok) {
      if (result.added) {
        toast.success('נוסף להשוואה', {
          action: { label: 'להשוואה', onClick: () => router.push('/compare') },
        })
      }
      return
    }
    toast.error(`אפשר להשוות עד ${COMPARE_LIMIT} מוצרים`, {
      description: 'הסירו מוצר מההשוואה כדי להוסיף אחר.',
      action: { label: 'להשוואה', onClick: () => router.push('/compare') },
    })
  }

  // The home deals rail carries synthetic ids (`ke-deal-9132`) that no row
  // answers to; the compare page would drop them. No control is better than
  // one that can only apologise.
  if (!isCompareId(productId)) return null

  const label = active ? 'הסר מההשוואה' : 'הוסף להשוואה'

  if (variant === 'overlay') {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        aria-label={label}
        title={label}
        data-compared={active ? 'true' : 'false'}
        className={
          className ??
          'tap-area absolute start-2 top-12 z-10 grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white/95 text-icon opacity-0 shadow-sm transition-opacity hover:border-price focus-visible:opacity-100 group-hover:opacity-100 data-[compared=true]:border-price data-[compared=true]:text-price data-[compared=true]:opacity-100 [@media(hover:none)]:opacity-100'
        }
      >
        <Scale size={18} strokeWidth={2} aria-hidden="true" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={label}
      data-compared={active ? 'true' : 'false'}
      className={
        className ??
        'tap-area tap-area--36 inline-flex items-center gap-1.5 text-sm font-semibold text-heading transition-colors hover:text-price data-[compared=true]:text-price'
      }
    >
      <Scale size={18} strokeWidth={2} aria-hidden="true" />
      <span aria-hidden="true">{active ? 'בהשוואה' : 'השוו'}</span>
    </button>
  )
}
