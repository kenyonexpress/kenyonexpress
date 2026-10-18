'use client'

import { shekelsFromIlsRounded } from '@/lib/money-format'
import { addToCart } from '@/server/actions/cart'
import { toggleWishlist } from '@/server/actions/reviews'
import type { WishlistEntry } from '@/server/queries/wishlist'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

interface WishlistCardProps {
  entry: WishlistEntry
  onRemove?: () => void
}

export default function WishlistCard({ entry, onRemove }: WishlistCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const image = (() => {
    if (!Array.isArray(entry.product?.images)) return null
    const first = entry.product.images.find((src): src is string => typeof src === 'string')
    return first ?? null
  })()

  const name = entry.product?.name_he ?? 'מוצר'
  const price = entry.product?.price_ils
  const href = entry.product?.slug ? `/product/${entry.product.slug}` : null

  const handleMoveToCart = async () => {
    setIsLoading(true)
    setMessage(null)
    try {
      const result = await addToCart(entry.product_id, null, 1)
      if (result.ok) {
        setMessage({ type: 'success', text: 'נוסף לעגלה' })
      } else {
        setMessage({ type: 'error', text: result.error || 'שגיאה בהוספה לעגלה' })
      }
    } catch (_err) {
      setMessage({ type: 'error', text: 'שגיאה בהוספה לעגלה' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemove = async () => {
    setIsLoading(true)
    setMessage(null)
    try {
      const result = await toggleWishlist(entry.product_id)
      if (result.ok) {
        setMessage({ type: 'success', text: 'הוסר מרשימת המשאלות' })
        setTimeout(() => onRemove?.(), 300)
      } else {
        setMessage({ type: 'error', text: result.error || 'שגיאה בהסרה' })
      }
    } catch (_err) {
      setMessage({ type: 'error', text: 'שגיאה בהסרה' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <li className="rounded-lg border border-border-alt p-4">
      <div className="wishlist-card">
        <div className="wishlist-card__content">
          {href ? (
            <Link href={href} className="wishlist-card__link">
              <div className="wishlist-card__image-wrapper">
                {image ? (
                  <Image
                    src={image}
                    alt=""
                    width={80}
                    height={80}
                    className="h-20 w-20 rounded-lg object-cover"
                  />
                ) : (
                  <span aria-hidden="true" className="h-20 w-20 rounded-lg bg-surface-hover" />
                )}
              </div>
              <div className="wishlist-card__details">
                <span className="block font-semibold">{name}</span>
                {price != null ? (
                  <span className="block text-sm text-price">{shekelsFromIlsRounded(price)}</span>
                ) : null}
              </div>
            </Link>
          ) : (
            <div className="wishlist-card__no-link">
              <div className="wishlist-card__image-wrapper">
                {image ? (
                  <Image
                    src={image}
                    alt=""
                    width={80}
                    height={80}
                    className="h-20 w-20 rounded-lg object-cover"
                  />
                ) : (
                  <span aria-hidden="true" className="h-20 w-20 rounded-lg bg-surface-hover" />
                )}
              </div>
              <div className="wishlist-card__details">
                <span className="block font-semibold">{name}</span>
                {price != null ? (
                  <span className="block text-sm text-price">{shekelsFromIlsRounded(price)}</span>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="wishlist-card__actions">
          <button
            type="button"
            className="wishlist-btn wishlist-btn--primary"
            onClick={handleMoveToCart}
            disabled={isLoading}
          >
            {isLoading ? 'מוסיף...' : 'העבר לעגלה'}
          </button>
          <button
            type="button"
            className="wishlist-btn wishlist-btn--secondary"
            onClick={handleRemove}
            disabled={isLoading}
            aria-label="הסר מרשימת המשאלות"
          >
            {isLoading ? '...' : '✕'}
          </button>
        </div>
      </div>

      {message && (
        <p
          className={`wishlist-card__message wishlist-card__message--${message.type}`}
          role="alert"
          aria-live="polite"
        >
          {message.text}
        </p>
      )}
    </li>
  )
}
