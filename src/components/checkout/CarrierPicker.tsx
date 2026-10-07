'use client'

import { shekels } from '@/lib/money-format'
import type { ShippingOption } from '@/lib/shipping/quote'
import { type ShippingQuotesState, getShippingQuotes } from '@/server/actions/shipping'
import { useEffect, useId, useRef, useState } from 'react'

/**
 * The carrier radio under the delivery address (STEP 43).
 *
 * Quotes are fetched on the server from the server-built cart; the form
 * sends only the city and the postal code. The picker re-quotes when the
 * city changes, keeps the shopper's pick when the same option is still
 * offered, and posts `shipping_option` as `<carrier>:<service>`. Nothing is
 * required: an unpicked carrier posts an empty string and the admin chooses
 * at label time, which is what happened before this picker existed.
 *
 * Native radios, like the cart's method selector: arrow keys, one tab stop,
 * RTL order from the DOM.
 */
export default function CarrierPicker({
  city,
  zip,
  initial = null,
}: {
  city: string
  zip: string | null
  /** Quotes rendered on the server for the first paint, when available. */
  initial?: ShippingQuotesState | null
}) {
  const groupId = useId()
  const [state, setState] = useState<ShippingQuotesState | null>(initial)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<string>('')
  const lastKey = useRef<string | null>(initial ? `${city}|${zip ?? ''}` : null)

  useEffect(() => {
    const key = `${city}|${zip ?? ''}`
    if (lastKey.current === key) return
    lastKey.current = key
    let cancelled = false
    setLoading(true)
    getShippingQuotes({ city, zip: zip ?? '' })
      .then((next) => {
        if (cancelled) return
        setState(next)
        setPicked((current) => (next.options.some((o) => o.id === current) ? current : ''))
      })
      .catch(() => {
        if (!cancelled) setState({ options: [], degraded: true, zone: null })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [city, zip])

  const options: ShippingOption[] = state?.options ?? []

  return (
    <fieldset
      className="cart-shipping checkout-carrier"
      data-testid="carrier-picker"
      aria-busy={loading || undefined}
    >
      <legend className="cart-shipping__legend">חברת משלוחים (אופציונלי)</legend>
      {/* The posted value, one hidden field, so an unpicked carrier posts "" and
          not the first radio. */}
      <input type="hidden" name="shipping_option" value={picked} />
      {options.length === 0 ? (
        <p className="checkout-field__hint" aria-live="polite">
          {loading
            ? 'בודקים זמינות חברות משלוחים...'
            : state?.degraded
              ? 'חברת המשלוחים תיבחר בעת הכנת החבילה. זמן המשלוח הוא 3-7 ימי עסקים.'
              : 'הזינו עיר כדי לראות את חברות המשלוחים הזמינות.'}
        </p>
      ) : (
        <div className="cart-shipping__options" role="presentation">
          {options.map((option) => {
            const id = `${groupId}-${option.id}`
            const checked = picked === option.id
            return (
              <label
                key={option.id}
                htmlFor={id}
                className="cart-shipping__option"
                data-checked={checked ? '' : undefined}
              >
                <input
                  id={id}
                  type="radio"
                  name={`carrier-${groupId}`}
                  value={option.id}
                  checked={checked}
                  onChange={() => setPicked(option.id)}
                  className="cart-shipping__input"
                />
                <span className="cart-shipping__text">
                  <span className="cart-shipping__label">
                    {option.carrierLabel} · {option.serviceLabel}
                  </span>
                  <span className="cart-shipping__description">{option.etaLabel}</span>
                </span>
                <span className="cart-shipping__cost tabular-nums">
                  {option.shopperAgorot === 0 ? 'חינם' : shekels(option.shopperAgorot)}
                </span>
              </label>
            )
          })}
        </div>
      )}
      {state?.degraded && options.length > 0 ? (
        <p className="checkout-field__hint">חלק מחברות המשלוחים לא זמינות כרגע.</p>
      ) : null}
    </fieldset>
  )
}
