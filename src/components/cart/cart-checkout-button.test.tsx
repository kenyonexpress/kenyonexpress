import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CartCheckoutButton from './CartCheckoutButton'

/**
 * The disabled checkout link has to REFUSE, not just look refused.
 *
 * `aria-disabled` on an anchor is an announcement. What stopped the click was
 * `pointer-events: none` in cart-page.css, and that blocks the mouse without
 * touching the keyboard: the link keeps its place in the tab order, so a
 * shopper holding an item that went out of stock could tab to it, press Enter,
 * and land on the checkout with a cart the checkout will refuse.
 *
 * This is a unit test and not an E2E one on purpose. Playwright's `click()`
 * respects pointer-events and would report the old behaviour as correct, which
 * is exactly how this survived: the guard being tested is the one CSS cannot
 * express.
 *
 * The money was never at risk - `beginCheckout` rebuilds the cart server-side
 * and refuses it through the same `validateCartView` - but the refusal would
 * have arrived after the whole address form was filled in.
 */
describe('CartCheckoutButton', () => {
  it('navigates when the cart is fine', () => {
    const onNavigate = vi.fn()
    render(<CartCheckoutButton isAuthenticated onNavigate={onNavigate} />)

    const link = screen.getByRole('link', { name: 'המשך לתשלום' })
    expect(link.getAttribute('href')).toBe('/checkout')
    expect(fireEvent.click(link)).toBe(true)
    expect(onNavigate).toHaveBeenCalledOnce()
  })

  it('refuses activation when disabled, and that is the keyboard path too', () => {
    const onNavigate = vi.fn()
    render(<CartCheckoutButton isAuthenticated disabled onNavigate={onNavigate} />)

    const link = screen.getByRole('link', { name: 'המשך לתשלום' })
    expect(link.getAttribute('aria-disabled')).toBe('true')

    // fireEvent.click returns false when a handler called preventDefault, which
    // is what cancels the navigation. Enter on a focused link dispatches this
    // same click, so one assertion covers both ways in.
    expect(fireEvent.click(link)).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('still points at the checkout while disabled, so the target is discoverable', () => {
    // Not a rewrite to `href={undefined}`: the control stays announced and
    // focusable, which is what aria-disabled is for. Only the activation goes.
    render(<CartCheckoutButton isAuthenticated={false} disabled />)
    expect(screen.getByRole('link', { name: 'המשך לתשלום' }).getAttribute('href')).toBe('/checkout')
  })
})
