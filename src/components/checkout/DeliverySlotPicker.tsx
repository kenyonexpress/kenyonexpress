'use client'

import {
  DEFAULT_MIN_BUSINESS_DAYS,
  type DeliverySlot,
  parseDeliverySlot,
} from '@/lib/checkout/delivery-slots'
import type { DeliveryEstimate } from '@/lib/shipping/estimate'

/**
 * The preferred-slot picker under the shipping address.
 *
 * A native `<select>` grouped by day. Native because it is the one control a
 * phone renders as a wheel with no work from us, and grouped because ten days
 * times two windows as a flat list is twenty lines to scan. "ללא העדפה" is the
 * first option and the default: the slot is optional (see
 * lib/checkout/delivery-slots.ts for why it is a preference and not a
 * booking), and an unpicked slot must post an empty string, not the first day.
 *
 * The slots arrive from the server already generated, with their business
 * day offset, and this component only DROPS the ones before the city's
 * estimate. When no city is known it keeps from the registry's own lower
 * bound, 3 business days, so the earliest option is never a day the method's
 * text says the parcel cannot reach.
 */
export default function DeliverySlotPicker({
  id,
  slots,
  estimate,
  defaultValue = '',
}: {
  id: string
  slots: readonly DeliverySlot[]
  /** The city's estimate when one is known; narrows the earliest day offered. */
  estimate: DeliveryEstimate | null
  defaultValue?: string
}) {
  const minOffset = estimate?.minDays ?? DEFAULT_MIN_BUSINESS_DAYS
  const offered = slots.filter((slot) => slot.offset >= minOffset)
  // Keep a previously chosen slot visible even if the city changed under it:
  // dropping the selected option would silently blank the choice.
  const kept = parseDeliverySlot(defaultValue)
  const visible =
    kept && !offered.some((slot) => slot.value === defaultValue)
      ? [...slots.filter((slot) => slot.value === defaultValue), ...offered]
      : offered

  const days = new Map<string, DeliverySlot[]>()
  for (const slot of visible) {
    const group = days.get(slot.dateLabel)
    if (group) group.push(slot)
    else days.set(slot.dateLabel, [slot])
  }

  return (
    <div className="checkout-field checkout-slot" data-testid="delivery-slot-picker">
      <label htmlFor={id}>מועד מסירה מועדף (אופציונלי)</label>
      <select
        id={id}
        name="delivery_slot"
        defaultValue={defaultValue}
        aria-describedby={`${id}-hint`}
      >
        <option value="">ללא העדפה</option>
        {[...days.entries()].map(([dateLabel, group]) => (
          <optgroup key={dateLabel} label={dateLabel}>
            {group.map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span id={`${id}-hint`} className="checkout-field__hint">
        {estimate
          ? `משלוח ל${estimate.city.name} מגיע תוך ${estimate.label}. הספק ישתדל למסור במועד שבחרתם.`
          : 'הספק ישתדל למסור במועד שבחרתם. זמן המשלוח הוא 3-7 ימי עסקים.'}
      </span>
    </div>
  )
}
