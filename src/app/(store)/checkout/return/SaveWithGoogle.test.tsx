import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SaveWithGoogle from './SaveWithGoogle'

// Mock the server action
vi.mock('@/server/actions/auth', () => ({
  linkGoogleAfterCheckout: vi.fn(),
}))

describe('SaveWithGoogle', () => {
  it('renders the save prompt and button', () => {
    render(<SaveWithGoogle next="/checkout/return?order_id=test123" />)
    expect(screen.getByText(/שמרו את הפרטים והכרטיס לקנייה הבאה/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /שמירה עם Google/ })).toBeInTheDocument()
  })

  it('passes the next URL as a hidden input', () => {
    const { container } = render(<SaveWithGoogle next="/checkout/return?order_id=test123" />)
    const input = container.querySelector('input[name="next"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('/checkout/return?order_id=test123')
  })

  it('shows pending state during submission', async () => {
    const { linkGoogleAfterCheckout } = await import('@/server/actions/auth')
    vi.mocked(linkGoogleAfterCheckout).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(null), 100)),
    )

    render(<SaveWithGoogle next="/checkout/return?order_id=test123" />)
    const button = screen.getByRole('button', { name: /שמירה עם Google/ })

    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText(/מעביר להתחברות\.\.\./)).toBeInTheDocument()
    })
  })

  it('displays error when linking fails', async () => {
    const { linkGoogleAfterCheckout } = await import('@/server/actions/auth')
    vi.mocked(linkGoogleAfterCheckout).mockResolvedValue({
      error: 'שגיאת חיבור לגוגל',
    })

    render(<SaveWithGoogle next="/checkout/return?order_id=test123" />)
    const button = screen.getByRole('button', { name: /שמירה עם Google/ })

    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('שגיאת חיבור לגוגל')
    })
  })

  it('preserves order_id in next parameter', () => {
    const orderId = 'abc123-def456'
    const nextUrl = `/checkout/return?order_id=${orderId}`

    const { container } = render(<SaveWithGoogle next={nextUrl} />)
    const input = container.querySelector('input[name="next"]') as HTMLInputElement

    expect(input.value).toContain(orderId)
    expect(input.value).toBe(nextUrl)
  })
})
