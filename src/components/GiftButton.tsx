'use client'

import { useCart } from '@/components/cart/CartProvider'
import { EcFavorites } from '@/components/icons/electro-icons'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface GiftButtonProps {
  productId: string
  isCoupon: boolean
}

/**
 * Gift purchase button for product page.
 *
 * Flow:
 * 1. Click "שלח כמתנה" button
 * 2. Adds product to cart
 * 3. Redirects to checkout with ?gift=true
 * 4. Checkout form auto-opens gift section where user fills details
 *
 * The gift form itself lives in CheckoutForm.tsx with fields for recipient email,
 * name, message (max 500 chars), and send_date. Backend handles the rest:
 * - checkout.ts reads gift fields and writes to orders table
 * - finalize.ts calls sendOrderGifts which queues gift email to notification_outbox
 * - /api/cron/notifications drains queue every 10 minutes
 */
export default function GiftButton({ productId, isCoupon }: GiftButtonProps) {
  const { addToCart, isPending } = useCart()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  // Only coupons can be gifted
  if (!isCoupon) return null

  const handleClick = async () => {
    setLoading(true)
    setFailed(false)
    try {
      await addToCart(productId, null, 1)
      router.push('/checkout?gift=true')
    } catch {
      setFailed(true)
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending || loading}
      className="product-gift-button"
      aria-label="שלח כמתנה"
    >
      <EcFavorites />
      <span>{loading ? 'מוסיף...' : 'שלח כמתנה'}</span>
      {failed && <span role="alert">לא הצלחנו להוסיף את המתנה, נסו שוב</span>}
    </button>
  )
}
