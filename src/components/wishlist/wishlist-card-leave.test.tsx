import { WISHLIST_CARD_LEAVE_FALLBACK_MS } from '@/lib/wishlist/page-view'
import type { WishlistViewItem } from '@/server/actions/wishlist'
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WishlistCard from './WishlistCard'

/**
 * UX20 (14.10.2026): A WISHLIST CARD LEAVES, IT DOES NOT VANISH.
 *
 * Measured before (logs/ux20/before.json, midRemove at all three widths):
 * the row was gone from the DOM within one frame of a remove press, and a
 * move press did the same. Now the press marks the card `data-leaving`,
 * freezes its two buttons, and the parent's write fires exactly once: on
 * `animationend` of the exit, or on the fallback timer when nothing animates
 * (this renderer, for one).
 *
 * What has to hold: a remove reaches the parent only after the exit; the
 * write fires once whichever signal comes first; a second press while
 * leaving is ignored; a REFUSED removal puts the card back; a move asks the
 * cart FIRST and starts the exit only on acceptance.
 */

const ITEM: WishlistViewItem = {
  productId: '11111111-1111-4111-8111-111111111111',
  savedAt: '2026-10-12T10:00:00.000Z',
  name: 'מקרר',
  slug: 'fridge',
  priceIls: 2500,
  fullPriceIls: 3000,
  image: null,
  available: true,
  soldOut: false,
}

const NOW = new Date('2026-10-14T12:00:00.000Z')

function endExit(card: HTMLElement, animationName = 'wishlist-card-leave') {
  const event = createEvent.animationEnd(card)
  Object.defineProperty(event, 'animationName', { value: animationName })
  fireEvent(card, event)
}

describe('WishlistCard, remove', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the catalogue anatomy: price, old price, discount, saved-ago', () => {
    render(<WishlistCard item={ITEM} onMove={vi.fn()} onRemove={vi.fn()} now={NOW} />)
    expect(screen.getByText('מקרר')).toBeInTheDocument()
    expect(screen.getByText('-17%')).toBeInTheDocument()
    expect(screen.getByText('נשמר לפני 2 ימים')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /מקרר/ })).toHaveAttribute('href', '/product/fridge')
    expect(screen.getByRole('button', { name: 'העברת מקרר לסל' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' })).toBeEnabled()
  })

  it('marks the card leaving, freezes it, and writes once on animationend', async () => {
    const onRemove = vi.fn().mockResolvedValue({ ok: true })
    const { container } = render(
      <WishlistCard item={ITEM} onMove={vi.fn()} onRemove={onRemove} now={NOW} />,
    )
    const card = container.querySelector('article') as HTMLElement

    fireEvent.click(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' }))
    expect(card).toHaveAttribute('data-leaving', 'remove')
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'העברת מקרר לסל' })).toBeDisabled()
    expect(onRemove).not.toHaveBeenCalled()

    // A second press while leaving is nothing.
    fireEvent.click(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' }))

    // A child's own animation bubbling up is ignored by name.
    endExit(card, 'wishlist-skeleton')
    expect(onRemove).not.toHaveBeenCalled()

    await act(async () => {
      endExit(card)
    })
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith(ITEM, 'remove')

    // The fallback timer does not fire a second write.
    await act(async () => {
      vi.advanceTimersByTime(WISHLIST_CARD_LEAVE_FALLBACK_MS + 10)
    })
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('writes once on the fallback timer when nothing animates', async () => {
    const onRemove = vi.fn().mockResolvedValue({ ok: true })
    render(<WishlistCard item={ITEM} onMove={vi.fn()} onRemove={onRemove} now={NOW} />)
    fireEvent.click(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' }))
    await act(async () => {
      vi.advanceTimersByTime(WISHLIST_CARD_LEAVE_FALLBACK_MS - 1)
    })
    expect(onRemove).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(2)
    })
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('a refused removal puts the card back under the shopper', async () => {
    const onRemove = vi.fn().mockResolvedValue({ ok: false })
    const { container } = render(
      <WishlistCard item={ITEM} onMove={vi.fn()} onRemove={onRemove} now={NOW} />,
    )
    const card = container.querySelector('article') as HTMLElement
    fireEvent.click(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' }))
    await act(async () => {
      endExit(card)
    })
    expect(card).not.toHaveAttribute('data-leaving')
    expect(card).not.toHaveAttribute('aria-busy')
    expect(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' })).toBeEnabled()

    // And it can be pressed again.
    onRemove.mockResolvedValue({ ok: true })
    fireEvent.click(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' }))
    await act(async () => {
      endExit(card)
    })
    expect(onRemove).toHaveBeenCalledTimes(2)
  })
})

describe('WishlistCard, move to cart', () => {
  it('asks the cart first and starts the exit only on acceptance', async () => {
    const onMove = vi.fn().mockResolvedValue(true)
    const onRemove = vi.fn().mockResolvedValue({ ok: true })
    const { container } = render(
      <WishlistCard item={ITEM} onMove={onMove} onRemove={onRemove} now={NOW} />,
    )
    const card = container.querySelector('article') as HTMLElement

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'העברת מקרר לסל' }))
    })
    expect(onMove).toHaveBeenCalledWith(ITEM)
    expect(card).toHaveAttribute('data-leaving', 'move')
    expect(screen.getByRole('button', { name: 'העברת מקרר לסל' })).toHaveTextContent('עבר לסל')
    expect(onRemove).not.toHaveBeenCalled()

    await act(async () => {
      endExit(card)
    })
    expect(onRemove).toHaveBeenCalledWith(ITEM, 'move')
  })

  it('a refused add leaves the product saved and the card in place', async () => {
    const onMove = vi.fn().mockResolvedValue(false)
    const onRemove = vi.fn()
    const { container } = render(
      <WishlistCard item={ITEM} onMove={onMove} onRemove={onRemove} now={NOW} />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'העברת מקרר לסל' }))
    })
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(container.querySelector('article')).not.toHaveAttribute('data-leaving')
    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'העברת מקרר לסל' })).toBeEnabled()
  })

  it('a sold-out product cannot be moved and says why; a gone product has no link', () => {
    const { rerender } = render(
      <WishlistCard
        item={{ ...ITEM, available: false, soldOut: true }}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        now={NOW}
      />,
    )
    expect(screen.getByRole('button', { name: 'אזל מהמלאי' })).toBeDisabled()
    expect(screen.getByText('אזל מהמלאי', { selector: 'p' })).toHaveAttribute(
      'data-state',
      'sold-out',
    )

    rerender(
      <WishlistCard
        item={{ ...ITEM, available: false, soldOut: false, slug: null }}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        now={NOW}
      />,
    )
    expect(screen.getByRole('button', { name: 'לא זמין' })).toBeDisabled()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('המוצר כבר לא זמין')).toBeInTheDocument()
  })

  it('waits while the page moves everything', () => {
    render(<WishlistCard item={ITEM} disabled onMove={vi.fn()} onRemove={vi.fn()} now={NOW} />)
    expect(screen.getByRole('button', { name: 'העברת מקרר לסל' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' })).toBeDisabled()
  })
})
