'use client'

import type { CartShipping } from '@/lib/cart/types'
import { shekels } from '@/lib/money-format'
import { deliveryCities, estimateDelivery } from '@/lib/shipping/estimate'
import { useEffect, useId, useState } from 'react'

/**
 * `localStorage` key of the shopper's delivery city. A preference and not
 * cart state: it changes no price and the server never reads it, so it does
 * not belong in the cart cookie or the store. Kept so the estimate is there
 * on the next visit without asking again.
 */
export const DELIVERY_CITY_KEY = 'ke_delivery_city_v1'

function readStoredCity(): string {
  try {
    return window.localStorage.getItem(DELIVERY_CITY_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeStoredCity(slug: string): void {
  try {
    if (slug === '') window.localStorage.removeItem(DELIVERY_CITY_KEY)
    else window.localStorage.setItem(DELIVERY_CITY_KEY, slug)
  } catch {
    // Storage disabled: the estimate still shows for this page.
  }
}

/**
 * The delivery estimate under the shipping selector.
 *
 * A native `<select>` of the cities in `lib/geo/cities.ts` and an `<output>`
 * for the sentence, which is what it is: a value computed from the shopper's
 * own pick. Renders only for supplier delivery, because nothing about a
 * pickup depends on where the shopper lives, and only says something once a
 * city is chosen; there is no country-wide default sentence because the
 * method's own description already carries that band.
 *
 * The city is read from storage in an effect so the server-rendered select
 * shows the placeholder and the client fills it after hydration, without a
 * mismatch.
 */
export default function CartDeliveryEstimate({ shipping }: { shipping: CartShipping }) {
  const id = useId()
  const [city, setCity] = useState('')

  useEffect(() => {
    setCity(readStoredCity())
  }, [])

  if (shipping.method !== 'supplier_delivery') return null

  const estimate = estimateDelivery(city, shipping.method)

  const pick = (slug: string) => {
    setCity(slug)
    writeStoredCity(slug)
  }

  return (
    <div className="cart-delivery" data-testid="cart-delivery-estimate">
      <label htmlFor={id} className="cart-delivery__label">
        זמן משלוח משוער לפי עיר
      </label>
      <select
        id={id}
        className="cart-delivery__select"
        value={city}
        onChange={(event) => pick(event.target.value)}
      >
        <option value="">בחרו עיר</option>
        {deliveryCities().map((entry) => (
          <option key={entry.slug} value={entry.slug}>
            {entry.name}
          </option>
        ))}
      </select>
      {estimate && (
        <output htmlFor={id} className="cart-delivery__estimate">
          משלוח ל{estimate.city.name}: {estimate.label},{' '}
          {shipping.cost === 0 ? 'ללא עלות' : shekels(shipping.cost)}
        </output>
      )}
    </div>
  )
}
