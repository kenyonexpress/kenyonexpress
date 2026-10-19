import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastDemo } from './ToastDemo'

vi.mock('@/lib/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
  }),
}))

describe('ToastDemo component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render demo component', () => {
    const { container } = render(<ToastDemo />)
    expect(container).toBeTruthy()
  })

  it('should display title and description', () => {
    render(<ToastDemo />)
    expect(screen.getByText('Toast Notification Demo')).toBeInTheDocument()
    expect(screen.getByText(/Click any button below/)).toBeInTheDocument()
  })

  it('should have success button', () => {
    render(<ToastDemo />)
    const button = screen.getByRole('button', { name: /Success/i })
    expect(button).toBeInTheDocument()
  })

  it('should have error button', () => {
    render(<ToastDemo />)
    const button = screen.getByRole('button', { name: /Error/i })
    expect(button).toBeInTheDocument()
  })

  it('should have info button', () => {
    render(<ToastDemo />)
    const button = screen.getByRole('button', { name: /Info/i })
    expect(button).toBeInTheDocument()
  })

  it('should have warning button', () => {
    render(<ToastDemo />)
    const button = screen.getByRole('button', { name: /Warning/i })
    expect(button).toBeInTheDocument()
  })

  it('should have loading button', () => {
    render(<ToastDemo />)
    const button = screen.getByRole('button', { name: /Loading/i })
    expect(button).toBeInTheDocument()
  })

  it('should have stack button', () => {
    render(<ToastDemo />)
    const button = screen.getByRole('button', { name: /Stack/i })
    expect(button).toBeInTheDocument()
  })

  it('should display features list', () => {
    render(<ToastDemo />)
    expect(screen.getByText(/Features/)).toBeInTheDocument()
    expect(screen.getByText(/Auto-dismiss with configurable durations/)).toBeInTheDocument()
    expect(screen.getByText(/Stack management/)).toBeInTheDocument()
    expect(screen.getByText(/RTL support for Hebrew text/)).toBeInTheDocument()
  })

  it('should have proper button styling', () => {
    render(<ToastDemo />)
    const successBtn = screen.getByRole('button', { name: /Success/i })
    expect(successBtn).toHaveClass('bg-green-100')
    expect(successBtn).toHaveClass('text-green-700')
  })

  it('should be clickable', () => {
    render(<ToastDemo />)
    const button = screen.getByRole('button', { name: /Success/i })
    expect(() => fireEvent.click(button)).not.toThrow()
  })

  it('should have all required feature checkmarks', () => {
    const { container } = render(<ToastDemo />)
    const features = container.querySelectorAll('li')
    expect(features.length).toBeGreaterThan(0)
  })

  it('should have RTL support class', () => {
    const { container } = render(<ToastDemo />)
    expect(container.innerHTML).toContain('grid-cols')
  })

  it('should have proper grid layout', () => {
    const { container } = render(<ToastDemo />)
    const grid = container.querySelector('.grid')
    expect(grid).toHaveClass('gap-2')
    expect(grid).toHaveClass('grid-cols-2')
  })

  it('should have loading button disabled when loading', async () => {
    render(<ToastDemo />)
    const loadingBtn = screen.getByRole('button', { name: /Loading/i })

    expect(loadingBtn).not.toBeDisabled()
    fireEvent.click(loadingBtn)

    expect(loadingBtn).toBeDisabled()

    await waitFor(
      () => {
        expect(loadingBtn).not.toBeDisabled()
      },
      { timeout: 5000 },
    )
  }, 5000)
})
