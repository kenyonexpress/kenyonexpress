'use client'

import { useCartStoreApi } from '@/components/cart/CartProvider'
import type { AppliedCoupon } from '@/lib/cart/types'
import { t } from '@/lib/i18n/messages'
import { applyCouponCode, removeCouponCode } from '@/server/actions/cart'
import { useState, useTransition } from 'react'

/**
 * The discount-code field.
 *
 * It was deliberately left out once, on the grounds that a box which takes a
 * code and does nothing with it is worse than no box: it reads as a broken
 * feature rather than a missing one. That reasoning is why this component
 * exists only alongside a server action that really prices the code, and why
 * failures are shown verbatim from the server. The shopper is told which rule
 * the code fell foul of — expired, exhausted, below the minimum, for a product
 * that is not in the cart — rather than a flat "invalid".
 */
export default function CartCouponForm({ coupon }: { coupon: AppliedCoupon | null }) {
  const store = useCartStoreApi()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const result = await applyCouponCode(code)
        if (result.ok) {
          store.getState().setCart(result.cart)
          setCode('')
        } else {
          setError(result.error)
        }
      } catch {
        setError('הפעולה נכשלה, נסו שוב')
      }
    })
  }

  const drop = () => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await removeCouponCode()
        if (result.ok) store.getState().setCart(result.cart)
      } catch {
        setError('הפעולה נכשלה, נסו שוב')
      }
    })
  }

  if (coupon) {
    return (
      <div className="cart-coupon cart-coupon--applied">
        <div className="cart-coupon__applied-text">
          <strong>{coupon.code}</strong>
          <span className="cart-coupon__label">{coupon.label}</span>
        </div>
        <button type="button" className="cart-coupon__remove" onClick={drop} disabled={pending}>
          הסרה
        </button>
      </div>
    )
  }

  return (
    /* Electro's `.coupon` cell: the field and a dark button joined into one
       pill, open at every width. It was a <details> below 768 while it sat in
       the totals box; in the actions row it is Electro's own control, and
       Electro does not fold it. */
    <form className="cart-coupon" onSubmit={submit}>
      <label className="sr-only" htmlFor="cart-coupon-code">
        קוד קופון
      </label>
      <div className="cart-coupon__row">
        <input
          id="cart-coupon-code"
          name="coupon_code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t('cartPage.couponPlaceholder')}
          autoComplete="off"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'cart-coupon-error' : undefined}
          className="cart-coupon__input"
        />
        <button
          type="submit"
          className="cart-coupon__submit"
          disabled={pending || code.trim() === ''}
        >
          {pending ? 'בודק...' : t('cartPage.applyCoupon')}
        </button>
      </div>
      {error && (
        <p className="cart-coupon__error" id="cart-coupon-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
