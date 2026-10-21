import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * THE VERIFIED-SHIPPING GATE ON THE FORM (F42).
 *
 * After five paid physical orders the server hands the form a
 * `verification` with `required: true`. Three things must then hold, and
 * each is a way the gate could silently not exist:
 *
 *  1. a saved address the gate judged incomplete is NOT offered as a summary
 *     and NOT posted by id: the fields come back, prefilled, with the postal
 *     code required;
 *  2. a complete saved address keeps its summary, but the address step does
 *     not let the shopper through until the phone is verified;
 *  3. once the verification component reports success, the same press moves
 *     on, and the proven number is posted so the server can match it.
 *
 * Like the sibling tests, this is the DOM and not a browser: the checkout
 * cannot be reached by one here. The server side of the gate is pinned in
 * lib/checkout/verified-shipping.test.ts and re-checked in `submitCheckout`.
 */

vi.mock('@/lib/analytics/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/analytics/commerce-client', () => ({ trackCommerce: vi.fn() }))
vi.mock('@/server/actions/auth', () => ({ signInWithGoogle: vi.fn() }))
vi.mock('@/server/actions/payments/checkout', () => ({ submitCheckout: vi.fn() }))

import type { CartView } from '@/lib/cart/types'
import type { ShippingVerification } from '@/lib/checkout/verified-shipping'
import { agorot } from '@/lib/money'
import CheckoutForm, { type CheckoutAddressPrefill } from './CheckoutForm'

const PHYSICAL_LINE = {
  product_id: '11111111-1111-4111-8111-111111111111',
  variant_id: null,
  quantity: 1,
  name_he: 'מקרר',
  slug: 'fridge',
  image_url: null,
  unit_price: agorot(250000),
  line_total: agorot(250000),
  type: 'physical' as const,
  available: true,
  platform_fee: agorot(25000),
  supplier_due: agorot(225000),
  customer_pays_now: agorot(250000),
  balance_due_at_business: agorot(0),
  platform_percent_bp: 1000,
  platform_percent_snapshot: 10,
  coupon_price_unit: null,
}

const CART = {
  id: 'cart-1',
  items: [PHYSICAL_LINE],
  item_count: 1,
  subtotal: agorot(250000),
  platform_fee: agorot(25000),
  supplier_due: agorot(225000),
  balance_due_at_business: agorot(0),
  coupon: null,
  discount: agorot(0),
  total: agorot(250000),
} as unknown as CartView

const SAVED: CheckoutAddressPrefill = {
  id: 'addr-1',
  full_name: 'דנה כהן',
  phone: '0501234567',
  city: 'תל אביב',
  street: 'דיזנגוף',
  street_number: '100',
  apartment: '4',
  floor: '2',
  zip: '6100000',
  email: 'dana@example.com',
}

function currentStep(container: HTMLElement): string | null {
  return container.querySelector('form.checkout-page__grid')?.getAttribute('data-step') ?? null
}

function renderGated(address: CheckoutAddressPrefill, verification: ShippingVerification) {
  return render(
    <CheckoutForm
      cart={CART}
      clientRef="00000000-0000-4000-8000-000000000000"
      needsAddress
      address={address}
      verification={verification}
      walletBalance={0}
      savedCards={[]}
      isAuthenticated
    />,
  )
}

describe('an incomplete saved address under the gate', () => {
  const gate = { required: true, addressComplete: false, phoneVerified: false }

  it('brings the fields back, prefilled, instead of the summary', () => {
    const { container } = renderGated({ ...SAVED, zip: '' }, gate)
    expect(container.querySelector('[name="address_id"]')).toBeNull()
    expect(container.querySelector<HTMLInputElement>('[name="city"]')?.value).toBe('תל אביב')
    expect(container.querySelector<HTMLInputElement>('[name="first_name"]')?.value).toBe('דנה')
    expect(screen.queryByText('דנה כהן')).toBeNull()
  })

  it('makes the postal code mandatory', () => {
    const { container } = renderGated({ ...SAVED, zip: '' }, gate)
    expect(container.querySelector('label[for="co-zip"]')?.textContent).not.toContain('אופציונלי')

    fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    expect(currentStep(container)).toBe('address')
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    expect(currentStep(container)).toBe('address')
    expect(container.querySelector('#co-zip-error')?.textContent).toBe('שדה חובה')
  })
})

describe('a complete saved address under the gate', () => {
  it('keeps the summary but holds the address step until the phone is verified', () => {
    const { container } = renderGated(SAVED, {
      required: true,
      addressComplete: true,
      phoneVerified: false,
    })
    expect(screen.getByText('דנה כהן')).toBeTruthy()
    expect(container.querySelector<HTMLInputElement>('[name="address_id"]')?.value).toBe('addr-1')
    expect(screen.getByTestId('shipping-phone-verification')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    expect(currentStep(container)).toBe('address')
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    expect(currentStep(container)).toBe('address')
    expect(container.querySelector('#co-err-phone-verified')?.textContent).toContain('לאמת')
  })

  it('moves on once the server has already seen the phone verified', () => {
    const { container } = renderGated(SAVED, {
      required: true,
      addressComplete: true,
      phoneVerified: true,
    })
    expect(screen.queryByTestId('shipping-phone-verification')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    expect(currentStep(container)).toBe('review')
  })

  it('moves on after the code is accepted in-page, and posts the proven number', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({
      json: async () =>
        url.endsWith('/send')
          ? { ok: true, channel: 'whatsapp', phone: '+972501234567', masked: '+9725*****567' }
          : { ok: true, phone: '+972501234567' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { container, findByRole, findByLabelText } = renderGated(SAVED, {
        required: true,
        addressComplete: true,
        phoneVerified: false,
      })
      fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
      fireEvent.click(screen.getByRole('button', { name: 'שליחת קוד אימות בוואטסאפ' }))
      const code = await findByLabelText('קוד בן 6 ספרות')
      fireEvent.change(code, { target: { value: '123456' } })
      fireEvent.click(await findByRole('button', { name: 'אימות' }))
      await screen.findByText('מספר הטלפון אומת. אפשר להמשיך.')

      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/checkout/phone-otp/send')
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
        phone: '0501234567',
      })
      expect(container.querySelector<HTMLInputElement>('[name="phone_verified_e164"]')?.value).toBe(
        '+972501234567',
      )

      fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
      expect(currentStep(container)).toBe('review')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('without the gate', () => {
  it('nothing about the form changes', () => {
    const { container } = renderGated(SAVED, {
      required: false,
      addressComplete: false,
      phoneVerified: false,
    })
    expect(screen.queryByTestId('shipping-phone-verification')).toBeNull()
    expect(container.querySelector<HTMLInputElement>('[name="address_id"]')?.value).toBe('addr-1')
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    expect(currentStep(container)).toBe('review')
  })
})
