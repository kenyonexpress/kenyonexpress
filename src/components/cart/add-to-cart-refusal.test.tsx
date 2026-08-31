import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A REFUSED ADD MUST NOT BE REPORTED AS A SALE'S WORTH OF INTENT.
 *
 * `AddToCartButton` awaited the store's `addToCart` and then fired
 * `add_to_cart` to the first-party tracker plus a PRICED `trackCommerce` event
 * to the ad platforms, under a comment promising it only did so "after the
 * server accepted the item". The store resolved for a refusal too, so the
 * comment described an intention rather than the code.
 *
 * WHY THIS IS NOT HYPOTHETICAL, AND WHY THE TEST USES THIS ID. The 32 cards in
 * the deals grid on the home page come from the `KE_LIVE_DEALS` fixture, whose
 * ids are synthetic strings like `ke-deal-9132`. `addToCartSchema` requires a
 * uuid, so the server refuses EVERY add from that grid with
 * "מזהה לא תקין" — and every one of them used to emit an add_to_cart carrying
 * the card's real shekel price. That is the whole home page inflating the
 * reported cart average.
 *
 * A UNIT TEST AND NOT AN E2E ONE. What is wrong is invisible in the DOM: the
 * error toast was always shown and the cart count always rolled back, so the
 * page behaved correctly while the analytics did not. The only observer is the
 * tracker call itself.
 */

const track = vi.hoisted(() => vi.fn())
const trackCommerce = vi.hoisted(() => vi.fn())
const addToCart = vi.hoisted(() => vi.fn())

vi.mock('@/lib/analytics/tracker', () => ({ track }))
vi.mock('@/lib/analytics/commerce-client', () => ({ trackCommerce }))
vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({ addToCart, isPending: false }),
}))

import AddToCartButton from './AddToCartButton'

/** The deals grid's shape: a synthetic id and a real price. */
const DEAL = {
  productId: 'ke-deal-9132',
  productName: 'ארוחת בוקר זוגית',
  priceAgorot: 12900,
}

async function clickAdd() {
  // `act` around the whole thing, not just the click: the handler is async and
  // its `busy` reset lands after the awaited store call, so the click alone
  // leaves a state update outside the wrapper.
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: `הוסף ${DEAL.productName} לעגלה` }))
  })
}

describe('AddToCartButton, when the server refuses the item', () => {
  beforeEach(() => {
    track.mockClear()
    trackCommerce.mockClear()
    addToCart.mockReset()
  })

  it('emits neither the first-party nor the vendor event', async () => {
    addToCart.mockResolvedValue(false)
    render(<AddToCartButton {...DEAL} variant="icon" />)

    await clickAdd()

    expect(addToCart).toHaveBeenCalledWith(DEAL.productId, null, 1, DEAL.productName)
    expect(track).not.toHaveBeenCalled()
    expect(trackCommerce).not.toHaveBeenCalled()
  })

  it('still emits both when the server accepts, so the guard is not a mute button', async () => {
    addToCart.mockResolvedValue(true)
    render(<AddToCartButton {...DEAL} variant="icon" />)

    await clickAdd()

    expect(track).toHaveBeenCalledWith('add_to_cart', {
      product_id: DEAL.productId,
      quantity: 1,
      variant_id: null,
    })
    expect(trackCommerce).toHaveBeenCalledWith('add_to_cart', {
      items: [
        {
          id: DEAL.productId,
          name: DEAL.productName,
          priceAgorot: DEAL.priceAgorot,
          quantity: 1,
        },
      ],
      valueAgorot: DEAL.priceAgorot,
    })
  })
})
