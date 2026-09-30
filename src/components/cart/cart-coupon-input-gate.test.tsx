import CartCouponForm from '@/components/cart/CartCouponForm'
import { CartProvider } from '@/components/cart/CartProvider'
import { EMPTY_CART } from '@/lib/cart/types'
import { luhnCheckDigit } from '@/lib/coupons/unit-codes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The coupon field's local gate, as the shopper meets it. What it holds:
 *
 *  - a digit-only code of the wrong length is refused in the field, the
 *    action is never called, and the message says "8 digits";
 *  - a mistyped check digit is refused the same way with its own message;
 *  - a good unit code and a campaign word both reach the action, normalised.
 */

const applyCouponCode = vi.fn()

vi.mock('@/server/actions/cart', () => ({
  addToCart: vi.fn(),
  updateCartItem: vi.fn(),
  removeFromCart: vi.fn(),
  clearCart: vi.fn(),
  removeUnavailableItems: vi.fn(),
  applyCouponCode: (...args: unknown[]) => applyCouponCode(...args),
  removeCouponCode: vi.fn(),
  setShippingMethod: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const body = '1234567'
const valid = body + String(luhnCheckDigit(body))
const wrongCheck = body + String((luhnCheckDigit(body) + 1) % 10)

function mount() {
  return render(
    <CartProvider initialCart={EMPTY_CART}>
      <CartCouponForm coupon={null} />
    </CartProvider>,
  )
}

function submit(code: string) {
  const input = screen.getByLabelText('קוד קופון')
  fireEvent.change(input, { target: { value: code } })
  fireEvent.submit(screen.getByRole('button', { name: 'החל' }).closest('form') as HTMLFormElement)
  return input
}

beforeEach(() => {
  vi.clearAllMocks()
  applyCouponCode.mockResolvedValue({ ok: false, error: 'server said no', code: 'COUPON_INVALID' })
})

describe('CartCouponForm: 8-digit gate', () => {
  it('refuses seven digits in the field without calling the server', () => {
    mount()
    const input = submit('1234567')
    expect(screen.getByRole('alert')).toHaveTextContent('8 ספרות')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(applyCouponCode).not.toHaveBeenCalled()
  })

  it('refuses a bad check digit with its own message', () => {
    mount()
    submit(wrongCheck)
    expect(screen.getByRole('alert')).toHaveTextContent('הספרות')
    expect(applyCouponCode).not.toHaveBeenCalled()
  })

  it('sends a good unit code, spaces stripped', async () => {
    mount()
    submit(`${valid.slice(0, 4)} ${valid.slice(4)}`)
    await waitFor(() => expect(applyCouponCode).toHaveBeenCalledWith(valid))
    // The server's refusal is shown verbatim, as before.
    expect(await screen.findByRole('alert')).toHaveTextContent('server said no')
  })

  it('sends a campaign word untouched apart from case', async () => {
    mount()
    submit('summer10')
    await waitFor(() => expect(applyCouponCode).toHaveBeenCalledWith('SUMMER10'))
  })

  it('caps the field at the server ceiling', () => {
    mount()
    expect(screen.getByLabelText('קוד קופון')).toHaveAttribute('maxlength', '64')
  })
})
