import { agorot } from '@/lib/money'
import { reorderFromOrder } from '@/server/actions/reorder'
import type { OrderSummary } from '@/server/queries/orders'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrderCard from './OrderCard'

vi.mock('@/server/actions/reorder')

const mockOrder: OrderSummary = {
  id: 'order-123',
  status: 'paid',
  settlementStatus: 'split_executed',
  createdAt: '2026-10-15T10:00:00Z',
  paidAt: '2026-10-15T10:05:00Z',
  totalAgorot: agorot(50000),
  itemCount: 3,
  hasVouchers: false,
}

describe('OrderCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders order summary with price and status', () => {
    render(<OrderCard order={mockOrder} />)
    expect(screen.getByText(/₪500.00/)).toBeInTheDocument()
    expect(screen.getByText('הושלמה')).toBeInTheDocument()
  })

  it('renders order date and item count', () => {
    render(<OrderCard order={mockOrder} />)
    expect(screen.getByText(/15\.10\.2026 · 3 פריטים/)).toBeInTheDocument()
  })

  it('shows voucher indicator when order has vouchers', () => {
    const orderWithVouchers = { ...mockOrder, hasVouchers: true }
    render(<OrderCard order={orderWithVouchers} />)
    expect(screen.getByText(/כולל קופונים/)).toBeInTheDocument()
  })

  it('has a details link', () => {
    render(<OrderCard order={mockOrder} />)
    const link = screen.getByRole('link', { name: 'פרטים' })
    expect(link).toHaveAttribute('href', '/account/orders/order-123')
  })

  it('expands when expand button is clicked', () => {
    render(<OrderCard order={mockOrder} />)
    const expandBtn = screen.getByRole('button', { name: /פתח הזמנה/ })
    fireEvent.click(expandBtn)
    expect(expandBtn).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows reorder button when expanded', () => {
    render(<OrderCard order={mockOrder} />)
    const expandBtn = screen.getByRole('button', { name: /פתח הזמנה/ })
    fireEvent.click(expandBtn)
    expect(screen.getByRole('button', { name: 'הוסף להזמנה חדשה' })).toBeInTheDocument()
  })

  it('calls reorderFromOrder when reorder button is clicked', async () => {
    vi.mocked(reorderFromOrder).mockResolvedValue({
      success: true,
      addedCount: 3,
      failedCount: 0,
      errors: [],
    })

    render(<OrderCard order={mockOrder} />)
    const expandBtn = screen.getByRole('button', { name: /פתח הזמנה/ })
    fireEvent.click(expandBtn)

    const reorderBtn = screen.getByRole('button', { name: 'הוסף להזמנה חדשה' })
    fireEvent.click(reorderBtn)

    await waitFor(() => {
      expect(reorderFromOrder).toHaveBeenCalledWith('order-123')
    })
  })

  it('shows success message when reorder succeeds', async () => {
    vi.mocked(reorderFromOrder).mockResolvedValue({
      success: true,
      addedCount: 3,
      failedCount: 0,
      errors: [],
    })

    render(<OrderCard order={mockOrder} />)
    const expandBtn = screen.getByRole('button', { name: /פתח הזמנה/ })
    fireEvent.click(expandBtn)

    const reorderBtn = screen.getByRole('button', { name: 'הוסף להזמנה חדשה' })
    fireEvent.click(reorderBtn)

    await waitFor(() => {
      expect(screen.getByText('3 פריטים נוספו לעגלה')).toBeInTheDocument()
    })
  })

  it('shows error message when reorder fails', async () => {
    vi.mocked(reorderFromOrder).mockResolvedValue({
      success: false,
      addedCount: 0,
      failedCount: 3,
      errors: ['המוצר אינו זמין'],
    })

    render(<OrderCard order={mockOrder} />)
    const expandBtn = screen.getByRole('button', { name: /פתח הזמנה/ })
    fireEvent.click(expandBtn)

    const reorderBtn = screen.getByRole('button', { name: 'הוסף להזמנה חדשה' })
    fireEvent.click(reorderBtn)

    await waitFor(() => {
      expect(screen.getByText('המוצר אינו זמין')).toBeInTheDocument()
    })
  })

  it('disables reorder button while loading', async () => {
    vi.mocked(reorderFromOrder).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                success: true,
                addedCount: 1,
                failedCount: 0,
                errors: [],
              }),
            100,
          ),
        ),
    )

    render(<OrderCard order={mockOrder} />)
    const expandBtn = screen.getByRole('button', { name: /פתח הזמנה/ })
    fireEvent.click(expandBtn)

    const reorderBtn = screen.getByRole('button', { name: 'הוסף להזמנה חדשה' })
    fireEvent.click(reorderBtn)

    expect(reorderBtn).toBeDisabled()
    expect(screen.getByText('מוסיף לעגלה...')).toBeInTheDocument()
  })

  it('collapses when expand button is clicked again', () => {
    render(<OrderCard order={mockOrder} />)
    const expandBtn = screen.getByRole('button', { name: /פתח הזמנה/ })
    fireEvent.click(expandBtn)
    expect(expandBtn).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(expandBtn)
    expect(expandBtn).toHaveAttribute('aria-expanded', 'false')
  })
})
