'use client'

import { useCart } from '@/components/cart/CartProvider'
import { useState } from 'react'

/**
 * "Add the whole set" (STEP 60). One tap, every member through the real
 * `addToCart`, in order, stopping at the first refusal: the product is
 * re-read and re-validated on the server for each line exactly as a single
 * add is, so a sold-out member refuses here the same way it would alone, and
 * the members already added stay in the cart (the shopper sees them there
 * with the saving missing and the reason on the line).
 *
 * Members without a variant only. A bundle names products, not variants;
 * a product that requires a size is added at its base line like the "החזר
 * לעגלה" path does, and the cart counts it toward the set whatever variant
 * it ends up as (evaluate.ts rule 3).
 */
export default function BundleAddButton({
  bundleName,
  members,
}: {
  bundleName: string
  members: { product_id: string; quantity: number; name_he: string }[]
}) {
  const { addToCart, isPending } = useCart()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const addAll = async () => {
    if (busy) return
    setBusy(true)
    setDone(false)
    try {
      for (const member of members) {
        const accepted = await addToCart(member.product_id, null, member.quantity, member.name_he)
        if (!accepted) return
      }
      setDone(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={addAll}
      disabled={busy || isPending}
      aria-busy={busy || undefined}
      className="pdp-bundle__add"
      data-testid="bundle-add-all"
      aria-label={`הוספת החבילה ${bundleName} לעגלה`}
    >
      {busy ? 'מוסיף…' : done ? 'החבילה בעגלה' : 'הוספת החבילה לעגלה'}
    </button>
  )
}
