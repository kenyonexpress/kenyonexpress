import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/analytics/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/analytics/commerce-client', () => ({ trackCommerce: vi.fn() }))
vi.mock('@/lib/analytics/feature-flags', () => ({
  getCheckoutVariant: vi.fn(async () => 'control'),
}))
vi.mock('@/server/actions/auth', () => ({ signInWithGoogle: vi.fn() }))
vi.mock('@/server/actions/payments/checkout', () => ({ submitCheckout: vi.fn() }))

import type { CartView } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import CheckoutForm, { type CheckoutAddressPrefill } from './CheckoutForm'

/**
 * The address autofill as the shopper meets it: a code fills an empty city,
 * a full street fills an empty code, and nothing the shopper typed is ever
 * replaced. The lookup itself is the route's business (route.test.ts); here
 * `fetch` is a stub and what is measured is what the form does with the
 * answer, including the answer that arrives after the shopper already typed.
 */

const EMPTY_ADDRESS: CheckoutAddressPrefill = {
  id: null,
  full_name: '',
  phone: '',
  city: '',
  street: '',
  street_number: '',
  apartment: '',
  floor: '',
  zip: '',
  email: '',
}

const PHYSICAL_LINE = {
  product_id: '44444444-4444-4444-8444-444444444444',
  variant_id: null,
  quantity: 1,
  name_he: 'מכונת קפה',
  slug: 'coffee',
  image_url: null,
  unit_price: agorot(50000),
  line_total: agorot(50000),
  type: 'physical' as const,
  available: true,
  platform_fee: agorot(5000),
  supplier_due: agorot(45000),
  customer_pays_now: agorot(50000),
  balance_due_at_business: agorot(0),
  platform_percent_bp: 1000,
  platform_percent_snapshot: null,
  coupon_price_unit: null,
}

const CART = {
  id: 'cart-1',
  items: [PHYSICAL_LINE],
  item_count: 1,
  subtotal: agorot(50000),
  platform_fee: agorot(5000),
  supplier_due: agorot(45000),
  balance_due_at_business: agorot(0),
  coupon: null,
  discount: agorot(0),
  total: agorot(50000),
} as unknown as CartView

function renderAddressForm() {
  const utils = render(
    <CheckoutForm
      cart={CART}
      clientRef="00000000-0000-4000-8000-000000000000"
      needsAddress
      address={EMPTY_ADDRESS}
      walletBalance={0}
      savedCards={[]}
      isAuthenticated
    />,
  )
  const field = (name: string) => {
    const el = utils.container.querySelector<HTMLInputElement>(`[name="${name}"]`)
    if (!el) throw new Error(`${name} field missing`)
    return el
  }
  return { ...utils, field }
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('postal code -> city', () => {
  it('fills an empty city from the code and says so', () => {
    const { field, container } = renderAddressForm()
    fireEvent.change(field('zip'), { target: { value: '6473424' } })
    fireEvent.blur(field('zip'))
    expect(field('city').value).toBe('תל אביב')
    expect(container.querySelector('#co-zip-hint')?.textContent).toContain('תל אביב')
    expect(container.querySelector('#co-zip-error')).toBeNull()
  })

  it('leaves a typed city alone and only hints when the code disagrees', () => {
    const { field, container } = renderAddressForm()
    fireEvent.change(field('city'), { target: { value: 'ירושלים' } })
    fireEvent.change(field('zip'), { target: { value: '6473424' } })
    fireEvent.blur(field('zip'))
    expect(field('city').value).toBe('ירושלים')
    expect(container.querySelector('#co-zip-hint')?.textContent).toContain('תל אביב')
  })

  it('says nothing when the code and the typed city agree, or the code is unknown', () => {
    const { field, container } = renderAddressForm()
    fireEvent.change(field('city'), { target: { value: 'תל אביב' } })
    fireEvent.change(field('zip'), { target: { value: '6473424' } })
    fireEvent.blur(field('zip'))
    expect(container.querySelector('#co-zip-hint')).toBeNull()

    fireEvent.change(field('zip'), { target: { value: '2000000' } })
    fireEvent.blur(field('zip'))
    expect(container.querySelector('#co-zip-hint')).toBeNull()
    expect(field('city').value).toBe('תל אביב')
  })

  it('keeps the validation error and shows no hint for a bad code', () => {
    const { field, container } = renderAddressForm()
    fireEvent.change(field('zip'), { target: { value: '12a4567' } })
    fireEvent.blur(field('zip'))
    expect(container.querySelector('#co-zip-error')).toBeTruthy()
    expect(container.querySelector('#co-zip-hint')).toBeNull()
    expect(field('city').value).toBe('')
  })
})

describe('street -> postal code', () => {
  const originalFetch = globalThis.fetch
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function fillStreet(field: (name: string) => HTMLInputElement) {
    fireEvent.change(field('city'), { target: { value: 'תל אביב' } })
    fireEvent.change(field('street'), { target: { value: 'דיזנגוף' } })
    fireEvent.change(field('street_number'), { target: { value: '12' } })
  }

  it('asks the server once the three fields are there and fills the empty code', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ zip: '6473424', configured: true }))
    const { field, container } = renderAddressForm()
    fillStreet(field)
    fireEvent.blur(field('street_number'))

    await waitFor(() => expect(field('zip').value).toBe('6473424'))
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url.startsWith('/api/checkout/postal-code?')).toBe(true)
    expect(url).toContain('house=12')
    expect(container.querySelector('#co-zip-hint')?.textContent).toContain('אוטומטית')
  })

  it('does not ask while a field is still empty', () => {
    const { field } = renderAddressForm()
    fireEvent.change(field('city'), { target: { value: 'תל אביב' } })
    fireEvent.change(field('street'), { target: { value: 'דיזנגוף' } })
    fireEvent.blur(field('street'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not ask, and never overwrites, when the shopper already typed a code', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ zip: '9999999', configured: true }))
    const { field } = renderAddressForm()
    fireEvent.change(field('zip'), { target: { value: '6473424' } })
    fillStreet(field)
    fireEvent.blur(field('street_number'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(field('zip').value).toBe('6473424')
  })

  it('drops an answer that arrives after the shopper typed the code themselves', async () => {
    let resolveLookup: (value: Response) => void = () => {}
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveLookup = resolve
      }),
    )
    const { field, container } = renderAddressForm()
    fillStreet(field)
    fireEvent.blur(field('street_number'))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.change(field('zip'), { target: { value: '9103401' } })
    resolveLookup(jsonResponse({ zip: '6473424', configured: true }))
    // Let the promise chain settle; the typed value must survive it.
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(field('zip').value).toBe('9103401')
    expect(container.querySelector('#co-zip-hint')).toBeNull()
  })

  it('is silent when the server has no suggestion or is unreachable', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ zip: null, configured: false }))
    const { field, container } = renderAddressForm()
    fillStreet(field)
    fireEvent.blur(field('street_number'))
    await new Promise((r) => setTimeout(r, 0))
    expect(field('zip').value).toBe('')
    expect(container.querySelector('#co-zip-hint')).toBeNull()

    fetchMock.mockRejectedValueOnce(new Error('offline'))
    fireEvent.blur(field('street'))
    await new Promise((r) => setTimeout(r, 0))
    expect(field('zip').value).toBe('')
    expect(container.querySelector('#co-zip-error')).toBeNull()
  })
})
