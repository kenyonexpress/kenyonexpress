import { checkOptionalIsraeliPostalCode } from '@/lib/checkout/israeli-postal-code'
import { checkIsraeliMobile } from '@/lib/checkout/steps'

/**
 * The verified-shipping gate (F42).
 *
 * A shopper's first physical orders ship to whatever address they type, and
 * the first one is saved for them. Once a customer has PAID for this many
 * physical orders, the next physical order is held to two extra conditions:
 * the shipping address must be complete (postal code and phone included, not
 * optional any more), and the phone on it must have been proven by a one-time
 * code delivered over WhatsApp. Coupon-only orders never see any of this:
 * nothing ships, so there is no address and no courier to protect.
 *
 * The threshold is a count of paid orders that contain at least one physical
 * line, not of items and not of attempts: five boxes in one order are one
 * order, and an abandoned checkout is nothing.
 *
 * Pure. The counting and the OTP lookups live in
 * `src/server/checkout/verified-shipping.ts`; the form and the action both
 * decide through the functions here so the client gate and the server gate
 * cannot disagree about what "complete" means.
 */
export const PHYSICAL_ORDERS_BEFORE_VERIFICATION = 5

export interface ShippingVerification {
  /** The shopper has reached the threshold, so the next order is gated. */
  required: boolean
  /** The saved default address (if any) passes `isCompleteShippingAddress`. */
  addressComplete: boolean
  /** The phone on that address has a consumed WhatsApp code against this account. */
  phoneVerified: boolean
}

export const NO_VERIFICATION: ShippingVerification = {
  required: false,
  addressComplete: false,
  phoneVerified: false,
}

export function requiresVerifiedShipping(paidPhysicalOrders: number): boolean {
  return (
    Number.isFinite(paidPhysicalOrders) && paidPhysicalOrders >= PHYSICAL_ORDERS_BEFORE_VERIFICATION
  )
}

export interface ShippingAddressFields {
  full_name?: string | null
  phone?: string | null
  city?: string | null
  street?: string | null
  street_number?: string | null
  zip?: string | null
}

const REQUIRED: ReadonlyArray<keyof ShippingAddressFields> = [
  'full_name',
  'phone',
  'city',
  'street',
  'street_number',
  'zip',
]

/**
 * Which of the six fields a complete address is missing or has wrong, by name.
 * Empty means complete. Apartment, floor and entrance stay optional: a private
 * house has none, and forcing a value there produces "0" and "-", not data.
 */
export function missingShippingFields(address: ShippingAddressFields): string[] {
  const missing: string[] = []
  for (const field of REQUIRED) {
    if ((address[field] ?? '').trim() === '') missing.push(field)
  }
  if (!missing.includes('phone') && checkIsraeliMobile(address.phone ?? '') !== null) {
    missing.push('phone')
  }
  if (!missing.includes('zip')) {
    const zip = checkOptionalIsraeliPostalCode(address.zip ?? '')
    if (!zip || !zip.ok) missing.push('zip')
  }
  return missing
}

export function isCompleteShippingAddress(address: ShippingAddressFields): boolean {
  return missingShippingFields(address).length === 0
}

/** The one message the form and the action both show for an unverified phone. */
export const PHONE_VERIFICATION_MESSAGE = 'יש לאמת את מספר הטלפון בוואטסאפ לפני שליחת ההזמנה'

export const ADDRESS_COMPLETION_MESSAGE =
  'אחרי חמש הזמנות של מוצרים פיזיים נדרשת כתובת מלאה, כולל מיקוד וטלפון נייד'
