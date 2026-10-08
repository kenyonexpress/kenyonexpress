import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * "Add the whole set" (STEP 60): every member goes through the real
 * `addToCart` in order with its quantity, and the first refusal stops the
 * loop so the members after it are not added to a cart whose set the
 * shopper can already see is incomplete.
 */

const addToCart = vi.fn()

vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({ addToCart, isPending: false }),
}))

import BundleAddButton from './BundleAddButton'

const MEMBERS = [
  { product_id: 'mug', quantity: 1, name_he: 'ספל' },
  { product_id: 'plate', quantity: 2, name_he: 'צלחת' },
  { product_id: 'bowl', quantity: 1, name_he: 'קערה' },
]

beforeEach(() => addToCart.mockReset())

describe('BundleAddButton', () => {
  it('adds every member in order with its quantity and then says so', async () => {
    addToCart.mockResolvedValue(true)
    render(<BundleAddButton bundleName="סט ארוחה" members={MEMBERS} />)
    fireEvent.click(screen.getByTestId('bundle-add-all'))
    await waitFor(() => expect(addToCart).toHaveBeenCalledTimes(3))
    expect(addToCart.mock.calls).toEqual([
      ['mug', null, 1, 'ספל'],
      ['plate', null, 2, 'צלחת'],
      ['bowl', null, 1, 'קערה'],
    ])
    await waitFor(() =>
      expect(screen.getByTestId('bundle-add-all').textContent).toBe('החבילה בעגלה'),
    )
  })

  it('stops at the first refusal', async () => {
    addToCart.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    render(<BundleAddButton bundleName="סט ארוחה" members={MEMBERS} />)
    fireEvent.click(screen.getByTestId('bundle-add-all'))
    await waitFor(() => expect(addToCart).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(screen.getByTestId('bundle-add-all').textContent).toBe('הוספת החבילה לעגלה'),
    )
    expect(addToCart).toHaveBeenCalledTimes(2)
  })

  it('names the bundle for assistive tech', () => {
    render(<BundleAddButton bundleName="סט ארוחה" members={MEMBERS} />)
    expect(screen.getByRole('button', { name: 'הוספת החבילה סט ארוחה לעגלה' })).toBeTruthy()
  })
})
