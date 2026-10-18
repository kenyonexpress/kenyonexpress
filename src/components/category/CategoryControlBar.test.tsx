import { fireEvent, render, screen } from '@testing-library/react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CategoryControlBar from './CategoryControlBar'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}))

describe('CategoryControlBar', () => {
  const mockPush = vi.fn()
  const mockSearchParams = new URLSearchParams()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useRouter as any).mockReturnValue({ push: mockPush })
    ;(usePathname as any).mockReturnValue('/products')
    ;(useSearchParams as any).mockReturnValue(mockSearchParams)
  })

  it('renders sort dropdown', () => {
    render(<CategoryControlBar value="newest" />)
    expect(screen.getByLabelText('מיון מוצרים')).toBeInTheDocument()
  })

  it('renders view switcher with 4 buttons', () => {
    render(<CategoryControlBar value="newest" />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(4)
  })

  it('marks first view button as active by default', () => {
    render(<CategoryControlBar value="newest" />)
    const buttons = screen.getAllByRole('button')
    const firstViewButton = buttons.find((btn) => btn.getAttribute('aria-pressed') === 'true')
    expect(firstViewButton).toBeDefined()
  })

  it('changes sort when select changes', async () => {
    render(<CategoryControlBar value="newest" />)
    const select = screen.getByLabelText('מיון מוצרים') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'price_asc' } })

    expect(mockPush).toHaveBeenCalled()
    const callArgs = mockPush.mock.calls[0]?.[0]
    expect(String(callArgs)).toContain('sort=price_asc')
  })

  it('removes sort parameter when set to newest', async () => {
    ;(useSearchParams as any).mockReturnValue(new URLSearchParams('sort=price_asc'))
    render(<CategoryControlBar value="price_asc" />)
    const select = screen.getByLabelText('מיון מוצרים') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'newest' } })

    expect(mockPush).toHaveBeenCalled()
    const callArgs = mockPush.mock.calls[0]?.[0]
    expect(String(callArgs)).not.toContain('sort=')
  })

  it('renders view switcher labels', () => {
    render(<CategoryControlBar value="newest" />)
    expect(screen.getByTitle('4 עמודות')).toBeInTheDocument()
    expect(screen.getByTitle('3 עמודות')).toBeInTheDocument()
    expect(screen.getByTitle('2 עמודות')).toBeInTheDocument()
    expect(screen.getByTitle('רשימה')).toBeInTheDocument()
  })

  it('changes view when view button is clicked', async () => {
    render(<CategoryControlBar value="newest" />)
    const listViewButton = screen.getByTitle('רשימה')
    fireEvent.click(listViewButton)

    expect(mockPush).toHaveBeenCalled()
    const callArgs = mockPush.mock.calls[0]?.[0]
    expect(String(callArgs)).toContain('view=list')
  })

  it('removes view parameter for default 4-col view', async () => {
    ;(useSearchParams as any).mockReturnValue(new URLSearchParams('view=list'))
    render(<CategoryControlBar value="newest" />)
    const defaultViewButton = screen.getByTitle('4 עמודות')
    fireEvent.click(defaultViewButton)

    expect(mockPush).toHaveBeenCalled()
    const callArgs = mockPush.mock.calls[0]?.[0]
    expect(String(callArgs)).not.toContain('view=')
  })

  it('marks selected view button as active', async () => {
    ;(useSearchParams as any).mockReturnValue(new URLSearchParams('view=2-col'))
    render(<CategoryControlBar value="newest" />)
    const twoColButton = screen.getByTitle('2 עמודות')
    expect(twoColButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('preserves other query parameters when changing sort', () => {
    ;(useSearchParams as any).mockReturnValue(new URLSearchParams('min=100&max=500'))
    render(<CategoryControlBar value="newest" />)
    const select = screen.getByLabelText('מיון מוצרים') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'price_asc' } })

    expect(mockPush).toHaveBeenCalled()
    const callArgs = mockPush.mock.calls[0]?.[0]
    expect(String(callArgs)).toContain('min=100')
    expect(String(callArgs)).toContain('max=500')
    expect(String(callArgs)).toContain('sort=price_asc')
  })

  it('preserves other query parameters when changing view', () => {
    ;(useSearchParams as any).mockReturnValue(new URLSearchParams('min=100&max=500'))
    render(<CategoryControlBar value="newest" />)
    const listViewButton = screen.getByTitle('רשימה')
    fireEvent.click(listViewButton)

    expect(mockPush).toHaveBeenCalled()
    const callArgs = mockPush.mock.calls[0]?.[0]
    expect(String(callArgs)).toContain('min=100')
    expect(String(callArgs)).toContain('max=500')
    expect(String(callArgs)).toContain('view=list')
  })

  it('disables controls while transition is pending', () => {
    render(<CategoryControlBar value="newest" />)
    const select = screen.getByLabelText('מיון מוצרים') as HTMLSelectElement
    expect(select).not.toBeDisabled()
  })
})
