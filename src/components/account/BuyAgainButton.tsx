'use client'

import { useCart } from '@/components/cart/CartProvider'
import { t } from '@/lib/i18n/messages'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * One tap from an old order to the checkout with the same line in the cart.
 *
 * WHAT "SAVED DETAILS" MEANS HERE, AND WHAT IT DOES NOT. The checkout prefills
 * the name, phone and address from `user_addresses` and the invoice preference
 * from the profile, so the customer who lands there has nothing to type but
 * the card. The card itself is never saved by this site: `payment_tokens`
 * holds a Cardcom token with the last four digits and the brand, and
 * `saved-cards.test.ts` guards that the token never reaches the browser. A
 * repeat purchase is therefore one tap plus the payment step, by design.
 *
 * THE ADD GOES THROUGH THE CART STORE, not a bespoke action: the same
 * `addToCart` the product page uses, with the same server-side refusals (a
 * product that went inactive since the order, a quantity over the cap). A
 * refused add shows the store's own error and stays on this page; only an
 * accepted one navigates.
 */
export default function BuyAgainButton({
  productId,
  productName,
  quantity,
}: {
  productId: string
  productName: string
  quantity: number
}) {
  const { addToCart, isPending } = useCart()
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  const handleClick = async () => {
    if (busy || isPending) return
    setBusy(true)
    try {
      const accepted = await addToCart(productId, null, Math.max(1, quantity), productName)
      if (accepted) router.push('/checkout')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="account-btn"
        onClick={() => void handleClick()}
        disabled={busy || isPending}
        data-testid="buy-again"
        data-product-id={productId}
      >
        {busy ? t('buyAgain.pending') : t('buyAgain.cta')}
      </button>
      <span className="account-row__meta">{t('buyAgain.hint')}</span>
    </span>
  )
}
