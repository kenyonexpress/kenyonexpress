import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EmailToggle from './EmailToggle'

describe('EmailToggle', () => {
  it('renders title and description', () => {
    const mockAction = vi.fn()
    render(
      <EmailToggle
        initial={false}
        title="Test Notification"
        description="This is a test description"
        action={mockAction}
        ariaLabelId="test-label"
      />,
    )

    expect(screen.getByText('Test Notification')).toBeInTheDocument()
    expect(screen.getByText('This is a test description')).toBeInTheDocument()
  })

  it('shows current state as button text when off', () => {
    const mockAction = vi.fn()
    render(
      <EmailToggle
        initial={false}
        title="Test"
        description="Desc"
        action={mockAction}
        ariaLabelId="test-label"
      />,
    )

    expect(screen.getByRole('switch')).toHaveTextContent('כבוי')
  })

  it('shows current state as button text when on', () => {
    const mockAction = vi.fn()
    render(
      <EmailToggle
        initial={true}
        title="Test"
        description="Desc"
        action={mockAction}
        ariaLabelId="test-label"
      />,
    )

    expect(screen.getByRole('switch')).toHaveTextContent('פעיל')
  })

  it('calls action with toggled value on click', async () => {
    const mockAction = vi.fn().mockResolvedValue({ ok: true, granted: true })
    render(
      <EmailToggle
        initial={false}
        title="Test"
        description="Desc"
        action={mockAction}
        ariaLabelId="test-label"
      />,
    )

    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(mockAction).toHaveBeenCalledWith(true)
    })
  })

  it('updates state after successful action', async () => {
    const mockAction = vi.fn().mockResolvedValue({ ok: true, granted: true })
    render(
      <EmailToggle
        initial={false}
        title="Test"
        description="Desc"
        action={mockAction}
        ariaLabelId="test-label"
      />,
    )

    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)

    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true')
    })
  })

  it('displays error message on failed action', async () => {
    const mockAction = vi.fn().mockResolvedValue({ ok: false, error: 'Failed to save' })
    render(
      <EmailToggle
        initial={false}
        title="Test"
        description="Desc"
        action={mockAction}
        ariaLabelId="test-label"
      />,
    )

    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to save')
    })
  })

  it('disables button during pending state', async () => {
    const mockAction = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, granted: true }), 100)),
      )
    render(
      <EmailToggle
        initial={false}
        title="Test"
        description="Desc"
        action={mockAction}
        ariaLabelId="test-label"
      />,
    )

    const toggle = screen.getByRole('switch')
    expect(toggle).not.toBeDisabled()

    fireEvent.click(toggle)
    expect(toggle).toBeDisabled()

    await waitFor(() => {
      expect(toggle).not.toBeDisabled()
    })
  })
})
