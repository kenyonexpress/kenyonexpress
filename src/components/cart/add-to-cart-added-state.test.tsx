import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX08: THE CONFIRMATION ONLY FOLLOWS AN ACCEPTED ADD, AND ONLY WHEN ASKED FOR.
 *
 * `addedLabel` makes the button read its confirmation (with `data-added` for
 * the caller's restyle and `addedClassName` for the keyframe) for
 * ADDED_CONFIRMATION_MS after the store resolved TRUE. The store resolves for
 * a refusal too (add-to-cart-refusal.test.tsx), so the gate is the same
 * `accepted` the analytics wait for: a refused add must never read "נוסף
 * לעגלה" while the error toast says otherwise. Callers that pass no label
 * see no change at all, which is every call site but the deal of the day.
 */

const track = vi.hoisted(() => vi.fn())
const trackCommerce = vi.hoisted(() => vi.fn())
const addToCart = vi.hoisted(() => vi.fn())

vi.mock('@/lib/analytics/tracker', () => ({ track }))
vi.mock('@/lib/analytics/commerce-client', () => ({ trackCommerce }))
vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({ addToCart, isPending: false }),
}))

import AddToCartButton, { ADDED_CONFIRMATION_MS } from './AddToCartButton'

const DEAL = {
  productId: '0b5e1c2a-7d4f-4a6e-9b3c-1f2e3d4c5b6a',
  productName: 'הסרת שיער בלייזר קר',
  priceAgorot: 25000,
}

async function click(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('AddToCartButton addedLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    track.mockClear()
    trackCommerce.mockClear()
    addToCart.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the confirmation with data-added and the keyframe class after an accepted add, then reverts', async () => {
    addToCart.mockResolvedValue(true)
    render(
      <AddToCartButton
        {...DEAL}
        addedLabel="נוסף לעגלה"
        addedClassName="deal-cta--added"
        className="cta"
      >
        הוסף לעגלה
      </AddToCartButton>,
    )
    await click('הוסף לעגלה')

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('data-added', '')
    expect(button).toHaveTextContent('נוסף לעגלה')
    expect(button).not.toHaveTextContent('הוסף לעגלה')
    expect(button.className).toBe('cta deal-cta--added')
    expect(button.querySelector('svg'), 'the check glyph').not.toBeNull()
    expect(button).toBeEnabled()
    expect(track).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(ADDED_CONFIRMATION_MS - 1)
    })
    expect(button).toHaveAttribute('data-added', '')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(button).not.toHaveAttribute('data-added')
    expect(button).toHaveTextContent('הוסף לעגלה')
    expect(button.className).toBe('cta')
  })

  it('never confirms a refused add', async () => {
    addToCart.mockResolvedValue(false)
    render(
      <AddToCartButton {...DEAL} addedLabel="נוסף לעגלה" addedClassName="deal-cta--added">
        הוסף לעגלה
      </AddToCartButton>,
    )
    await click('הוסף לעגלה')
    const button = screen.getByRole('button')
    expect(button).not.toHaveAttribute('data-added')
    expect(button).toHaveTextContent('הוסף לעגלה')
    expect(button).not.toHaveTextContent('נוסף')
    expect(track).not.toHaveBeenCalled()
  })

  it('is unchanged for callers that pass no label', async () => {
    addToCart.mockResolvedValue(true)
    render(
      <AddToCartButton {...DEAL} className="cta">
        הוסף לעגלה
      </AddToCartButton>,
    )
    await click('הוסף לעגלה')
    const button = screen.getByRole('button')
    expect(button).not.toHaveAttribute('data-added')
    expect(button).toHaveTextContent('הוסף לעגלה')
    expect(button.className).toBe('cta')
  })

  it('shows the check in the icon variant too, keeping its accessible name', async () => {
    addToCart.mockResolvedValue(true)
    render(
      <AddToCartButton {...DEAL} variant="icon" addedLabel="נוסף לעגלה">
        <span data-glyph="cart" />
      </AddToCartButton>,
    )
    const name = `הוסף ${DEAL.productName} לעגלה`
    await click(name)
    const button = screen.getByRole('button', { name })
    expect(button).toHaveAttribute('data-added', '')
    expect(button.querySelector('[data-glyph="cart"]')).toBeNull()
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('a second accepted add restarts the confirmation instead of cutting it short', async () => {
    addToCart.mockResolvedValue(true)
    render(
      <AddToCartButton {...DEAL} addedLabel="נוסף לעגלה">
        הוסף לעגלה
      </AddToCartButton>,
    )
    await click('הוסף לעגלה')
    act(() => {
      vi.advanceTimersByTime(ADDED_CONFIRMATION_MS - 100)
    })
    await click('נוסף לעגלה')
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByRole('button')).toHaveAttribute('data-added', '')
    act(() => {
      vi.advanceTimersByTime(ADDED_CONFIRMATION_MS)
    })
    expect(screen.getByRole('button')).not.toHaveAttribute('data-added')
  })

  it('drops its timer with the button', async () => {
    addToCart.mockResolvedValue(true)
    const { unmount } = render(
      <AddToCartButton {...DEAL} addedLabel="נוסף לעגלה">
        הוסף לעגלה
      </AddToCartButton>,
    )
    await click('הוסף לעגלה')
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
