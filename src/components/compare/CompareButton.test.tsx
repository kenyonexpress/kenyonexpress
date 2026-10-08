import { resetCompareHydrationForTests, useCompareStore } from '@/lib/compare/client-store'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CompareButton from './CompareButton'

const push = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toast.success(...a),
    error: (...a: unknown[]) => toast.error(...a),
  },
}))

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'
const E = '55555555-5555-4555-8555-555555555555'

beforeEach(() => {
  localStorage.clear()
  resetCompareHydrationForTests()
  push.mockReset()
  toast.success.mockReset()
  toast.error.mockReset()
})

describe('CompareButton', () => {
  it('renders nothing for a synthetic id', () => {
    const { container } = render(<CompareButton productId="ke-deal-9132" />)
    expect(container.innerHTML).toBe('')
  })

  it('toggles the product in and out of the list and swallows the card click', () => {
    const onCardClick = vi.fn()
    render(
      <a href="/product/x" onClick={onCardClick}>
        <CompareButton productId={A} variant="overlay" />
      </a>,
    )
    const button = screen.getByRole('button', { name: 'הוסף להשוואה' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(button)
    expect(useCompareStore.getState().ids).toEqual([A])
    expect(onCardClick).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledTimes(1)
    const pressed = screen.getByRole('button', { name: 'הסר מההשוואה' })
    expect(pressed).toHaveAttribute('aria-pressed', 'true')
    expect(pressed).toHaveAttribute('data-compared', 'true')
    fireEvent.click(pressed)
    expect(useCompareStore.getState().ids).toEqual([])
  })

  it('refuses the fifth product with a sentence that names the limit', () => {
    const s = useCompareStore.getState()
    for (const id of [A, B, C, D]) s.add(id)
    render(<CompareButton productId={E} />)
    fireEvent.click(screen.getByRole('button', { name: 'הוסף להשוואה' }))
    expect(useCompareStore.getState().ids).toEqual([A, B, C, D])
    expect(toast.error).toHaveBeenCalledWith('אפשר להשוות עד 4 מוצרים', expect.anything())
    // The toast's action is the way to the page where a column can be freed.
    const opts = toast.error.mock.calls[0]?.[1] as { action: { onClick: () => void } }
    opts.action.onClick()
    expect(push).toHaveBeenCalledWith('/compare')
  })

  it('reads the list back from storage after mount', async () => {
    localStorage.setItem('ke_compare_v1', JSON.stringify({ state: { ids: [A] }, version: 0 }))
    render(<CompareButton productId={A} />)
    expect(await screen.findByRole('button', { name: 'הסר מההשוואה' })).toBeInTheDocument()
  })

  it('keeps the inline word short so the share row does not grow', () => {
    render(<CompareButton productId={A} variant="inline" />)
    expect(screen.getByRole('button').className).toContain('tap-area--36')
    expect(screen.getByRole('button').textContent).toBe('השוו')
  })
})
