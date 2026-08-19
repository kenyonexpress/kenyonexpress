import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * A RETURNING CUSTOMER WITH A SAVED ADDRESS COULD NOT LEAVE STEP 1.
 *
 * The form is four steps and the whole thing stays mounted; only visibility
 * changes. `goNext` runs `validateStep` over the live `FormData` before it
 * moves, and the details step requires `first_name`, `last_name`, `phone` and
 * `email`.
 *
 * When the shopper has a saved address, NONE of those four inputs is rendered:
 * the personal-details block collapses to `<p>{address.full_name}</p>` and the
 * address is submitted by id instead. So `FormData` holds none of the four
 * names, the gate reports four missing required fields, and "המשך" does
 * nothing - on a step that shows a single line of text with nothing to fix.
 *
 * The code already knew this shape. `addressStepIsAutomatic` exists a few
 * lines above with a comment describing this exact trap ("would report three
 * missing required fields and trap the shopper on a step that shows only a
 * summary") - and bypassed the ADDRESS step only, while the DETAILS step above
 * it collapses on the same condition and was left validating fields it had
 * just chosen not to render.
 *
 * WHO IT HIT: only signed-in shoppers, and only those who had checked out
 * before, since `page.tsx` fills `address.id` from `user_addresses`. A guest
 * gets the full form and walks through. That is the wrong half to break - the
 * customer who has bought here before is the one who cannot buy again.
 *
 * The server never wanted the four fields on this path: `submitCheckout` reads
 * `first_name`/`last_name`/`phone` only inside `if (needsAddress && !addressId)`,
 * and takes the email from the session. The gate was guarding an input the
 * submission does not carry.
 *
 * NOT AN E2E TEST, because the checkout cannot be reached by one here: the
 * guest cart, the address read and the wallet all go through the admin client,
 * and the local `SUPABASE_SECRET_KEY` is the stock demo key the hosted project
 * rejects. The gate is a pure function of the DOM either way.
 */

vi.mock('@/lib/analytics/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/analytics/commerce-client', () => ({ trackCommerce: vi.fn() }))
vi.mock('@/server/actions/auth', () => ({ signInWithGoogle: vi.fn() }))
vi.mock('@/server/actions/payments/checkout', () => ({ submitCheckout: vi.fn() }))

import CheckoutForm, { type CheckoutAddressPrefill } from './CheckoutForm'
import type { CartView } from '@/lib/cart/types'
import { agorot } from '@/lib/money'

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

const SAVED_ADDRESS: CheckoutAddressPrefill = {
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

/**
 * The step the form is actually showing, read the way the CSS reads it.
 * Selected by class, not by tag: the hidden Google sign-in form is rendered
 * first and `querySelector('form')` picks that one up.
 */
function currentStep(container: HTMLElement): string | null {
  return container.querySelector('form.checkout-page__grid')?.getAttribute('data-step') ?? null
}

function renderCheckout(address: CheckoutAddressPrefill) {
  return render(
    <CheckoutForm
      cart={CART}
      clientRef="00000000-0000-4000-8000-000000000000"
      needsAddress
      address={address}
      walletBalance={0}
      savedCards={[]}
      isAuthenticated
    />,
  )
}

describe('the checkout step gate on a saved address', () => {
  it('does not render the four fields the details step validates', () => {
    // The premise of the bug, stated first so a future rewrite that brings the
    // fields back fails HERE and not with a confusing failure two tests down.
    const { container } = renderCheckout(SAVED_ADDRESS)
    for (const name of ['first_name', 'last_name', 'phone', 'email']) {
      expect(container.querySelector(`[name="${name}"]`), name).toBeNull()
    }
    expect(screen.getByText('דנה כהן')).toBeTruthy()
  })

  it('walks a saved address from the details step to the address step and on', () => {
    const { container } = renderCheckout(SAVED_ADDRESS)
    expect(currentStep(container)).toBe('details')

    fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    expect(currentStep(container)).toBe('address')

    // And the address step, already bypassed before this fix, still is.
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    expect(currentStep(container)).toBe('review')
  })

  it('shows no field errors while doing it', () => {
    // This one passed BEFORE the fix too, and that is the finding: the error
    // slots are rendered inside the same branch as the fields, so the blocked
    // shopper was not even told why. "המשך" simply did nothing. Kept because a
    // fix that moved the errors outside the branch would now show four of them
    // over a summary the shopper cannot edit.
    const { container } = renderCheckout(SAVED_ADDRESS)
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    expect(container.querySelectorAll('.checkout-field__error')).toHaveLength(0)
  })

  it('still stops a guest with an empty form on the details step', () => {
    // The bypass is keyed on the saved address, not on the step. Without this
    // the fix would be a hole: anyone could walk to the pay button with no
    // name, no phone and no address behind it.
    const { container } = renderCheckout(EMPTY_ADDRESS)
    expect(currentStep(container)).toBe('details')

    fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    expect(currentStep(container)).toBe('details')
    expect(container.querySelectorAll('.checkout-field__error').length).toBeGreaterThan(0)
  })
})
