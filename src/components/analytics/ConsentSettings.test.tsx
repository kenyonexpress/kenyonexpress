import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ConsentSettings from './ConsentSettings'

// Mock the server action
vi.mock('@/server/actions/consent', () => ({
  saveGranularConsent: vi.fn().mockResolvedValue(undefined),
}))

describe('ConsentSettings', () => {
  it('does not render when closed', () => {
    const onClose = vi.fn()
    const { container } = render(<ConsentSettings isOpen={false} onClose={onClose} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders when open', () => {
    const onClose = vi.fn()
    render(<ConsentSettings isOpen={true} onClose={onClose} />)
    expect(screen.getByText('הגדרות עוגיות ופרטיות')).toBeInTheDocument()
  })

  it('displays all three consent categories', () => {
    const onClose = vi.fn()
    render(<ConsentSettings isOpen={true} onClose={onClose} />)

    expect(screen.getByText('עוגיות הכרחיות')).toBeInTheDocument()
    expect(screen.getByText('ניתוח שימוש')).toBeInTheDocument()
    expect(screen.getByText('שיווק ופרסום')).toBeInTheDocument()
  })

  it('shows essential as always active', () => {
    const onClose = vi.fn()
    render(<ConsentSettings isOpen={true} onClose={onClose} />)

    expect(screen.getByText('תמיד פעיל')).toBeInTheDocument()
  })

  it('allows toggling analytics', () => {
    const onClose = vi.fn()
    render(<ConsentSettings isOpen={true} onClose={onClose} />)

    const analyticsToggle = screen.getByLabelText(/הפעל ניתוח שימוש|כבה ניתוח שימוש/)
    expect(analyticsToggle).toBeInTheDocument()

    fireEvent.click(analyticsToggle)
    // After click, the label should change
    expect(screen.getByLabelText(/הפעל ניתוח שימוש|כבה ניתוח שימוש/)).toBeInTheDocument()
  })

  it('allows toggling marketing', () => {
    const onClose = vi.fn()
    render(<ConsentSettings isOpen={true} onClose={onClose} />)

    const marketingToggle = screen.getByLabelText(/הפעל שיווק ופרסום|כבה שיווק ופרסום/)
    expect(marketingToggle).toBeInTheDocument()

    fireEvent.click(marketingToggle)
    // After click, the label should change
    expect(screen.getByLabelText(/הפעל שיווק ופרסום|כבה שיווק ופרסום/)).toBeInTheDocument()
  })

  it('has accept all button', () => {
    const onClose = vi.fn()
    render(<ConsentSettings isOpen={true} onClose={onClose} />)

    expect(screen.getByText('אישור הכל')).toBeInTheDocument()
  })

  it('has reject all button', () => {
    const onClose = vi.fn()
    render(<ConsentSettings isOpen={true} onClose={onClose} />)

    expect(screen.getByText('דחיית הכל')).toBeInTheDocument()
  })

  it('has save preferences button', () => {
    const onClose = vi.fn()
    render(<ConsentSettings isOpen={true} onClose={onClose} />)

    expect(screen.getByText('שמירת העדפות')).toBeInTheDocument()
  })

  it('has cancel button', () => {
    const onClose = vi.fn()
    render(<ConsentSettings isOpen={true} onClose={onClose} />)

    expect(screen.getByText('ביטול')).toBeInTheDocument()
  })

  it('calls onClose when cancel button clicked', () => {
    const onClose = vi.fn()
    render(<ConsentSettings isOpen={true} onClose={onClose} />)

    const cancelButton = screen.getByText('ביטול')
    fireEvent.click(cancelButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<ConsentSettings isOpen={true} onClose={onClose} />)

    // Click the backdrop (first div with fixed class)
    const backdrop = container.querySelector('.fixed')
    expect(backdrop).toBeInTheDocument()
    fireEvent.click(backdrop!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when modal content clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<ConsentSettings isOpen={true} onClose={onClose} />)

    // Click the modal content (div with max-w-2xl)
    const modalContent = container.querySelector('.max-w-2xl')
    expect(modalContent).toBeInTheDocument()
    fireEvent.click(modalContent!)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('has proper ARIA attributes', () => {
    const onClose = vi.fn()
    render(<ConsentSettings isOpen={true} onClose={onClose} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-labelledby', 'consent-settings-title')

    expect(screen.getByRole('heading', { name: 'הגדרות עוגיות ופרטיות' })).toHaveAttribute(
      'id',
      'consent-settings-title',
    )
  })
})
