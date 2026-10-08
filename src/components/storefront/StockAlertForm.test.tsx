import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * The sold-out page's "tell me when it is back" form (STEP 58). Pinned: the
 * product and variant ride in hidden fields, the address field is LTR and
 * optional with a note saying why, an error from the action is announced
 * beside the field, and a success replaces the whole form with one line.
 */

const mock = vi.hoisted(() => ({
  state: { ok: false } as { ok: boolean; message?: string; error?: string },
}))

vi.mock('@/server/actions/stock-alerts', () => ({ joinStockWaitlist: vi.fn() }))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useActionState: () => [mock.state, vi.fn(), false],
  }
})

import StockAlertForm from './StockAlertForm'

const P = '11111111-1111-4111-8111-111111111111'
const V = '22222222-2222-4222-8222-222222222222'

describe('StockAlertForm', () => {
  it('carries the product and the variant, and asks for an optional LTR address', () => {
    mock.state = { ok: false }
    const { container } = render(<StockAlertForm productId={P} variantId={V} />)
    expect(container.querySelector('input[name="productId"]')).toHaveValue(P)
    expect(container.querySelector('input[name="variantId"]')).toHaveValue(V)
    const email = screen.getByLabelText('עדכנו אותי כשהמוצר חוזר למלאי')
    expect(email).toHaveAttribute('type', 'email')
    expect(email).toHaveAttribute('dir', 'ltr')
    expect(email).not.toBeRequired()
    expect(screen.getByRole('button', { name: 'עדכנו אותי' })).toBeEnabled()
    expect(screen.getByText(/מחוברים יכולים להשאיר את השדה ריק/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sends an empty variant field when there is no variant', () => {
    mock.state = { ok: false }
    const { container } = render(<StockAlertForm productId={P} variantId={null} />)
    expect(container.querySelector('input[name="variantId"]')).toHaveValue('')
  })

  it('announces the action error beside the field', () => {
    mock.state = { ok: false, error: 'נא למלא כתובת מייל.' }
    render(<StockAlertForm productId={P} variantId={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent('נא למלא כתובת מייל.')
    expect(screen.getByLabelText('עדכנו אותי כשהמוצר חוזר למלאי')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('replaces the form with one line on success', () => {
    mock.state = { ok: true, message: 'נעדכן אותך במייל ברגע שהמוצר יחזור למלאי.' }
    render(<StockAlertForm productId={P} variantId={null} />)
    expect(screen.queryByTestId('stock-alert-form')).toBeNull()
    expect(screen.getByText('נעדכן אותך במייל ברגע שהמוצר יחזור למלאי.')).toBeInTheDocument()
  })
})
